import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import pool from "../db/pool.js";
import { requireAuth, type JwtPayload } from "../middleware/auth.js";

const router = Router();

const NOTIFICATION_TYPES = ["General", "Reminder", "Alert", "Notice"] as const;
const RECIPIENT_SCOPES = ["all", "active", "inactive", "custom"] as const;

type NotificationType = (typeof NOTIFICATION_TYPES)[number];
type RecipientScope = (typeof RECIPIENT_SCOPES)[number];

type MemberTargetRow = {
  uuid: string;
  user_id: string;
  name: string;
};

type NotificationRow = {
  uuid: string;
  title: string;
  message: string;
  type: NotificationType;
  recipient_scope: RecipientScope;
  recipient_label: string;
  recipient_count: number;
  created_at: Date;
  created_by_name?: string | null;
};

type RecipientRow = {
  recipient_uuid: string;
  notification_uuid: string;
  title: string;
  message: string;
  type: NotificationType;
  recipient_scope: RecipientScope;
  recipient_label: string;
  is_read: number;
  read_at: Date | null;
  created_at: Date;
};

type TransactionalConnection = {
  query: <T = unknown>(sql: string, params?: unknown[]) => Promise<[T, unknown]>;
  beginTransaction: () => Promise<void>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  release: () => void;
};

function getRequestUser(req: Request): JwtPayload | undefined {
  return (req as Request & { user?: JwtPayload }).user;
}

function ensureAdmin(req: Request, res: Response): boolean {
  const user = getRequestUser(req);
  if (process.env.NODE_ENV === "production" && !user) {
    res.status(401).json({ detail: "Authentication required" });
    return false;
  }
  if (user && user.user_type !== "Admin") {
    res.status(403).json({ detail: "Admin access required" });
    return false;
  }
  return true;
}

function ensureAuthenticatedUser(req: Request, res: Response): string | null {
  const user = getRequestUser(req);
  if (!user?.sub) {
    res.status(401).json({ detail: "Authentication required" });
    return null;
  }
  return user.sub;
}

function rowToSentNotification(row: NotificationRow) {
  return {
    id: row.uuid,
    uuid: row.uuid,
    title: row.title,
    message: row.message,
    type: row.type,
    recipient_scope: row.recipient_scope,
    recipients: row.recipient_label,
    delivered: Number(row.recipient_count ?? 0),
    created_by: row.created_by_name ?? undefined,
    created_at: row.created_at?.toISOString?.() ?? undefined,
  };
}

function rowToReceivedNotification(row: RecipientRow) {
  return {
    id: row.recipient_uuid,
    uuid: row.recipient_uuid,
    notification_uuid: row.notification_uuid,
    title: row.title,
    message: row.message,
    type: row.type,
    recipient_scope: row.recipient_scope,
    recipients: row.recipient_label,
    is_read: Boolean(row.is_read),
    read_at: row.read_at?.toISOString?.() ?? undefined,
    created_at: row.created_at?.toISOString?.() ?? undefined,
  };
}

async function getRecipientMembers(
  conn: TransactionalConnection,
  scope: RecipientScope,
  memberUuid: string | null,
): Promise<{ members: MemberTargetRow[]; label: string }> {
  if (scope === "custom") {
    const [rows] = await conn.query<MemberTargetRow[]>(
      "SELECT uuid, user_id, name FROM members WHERE uuid = ? AND user_type = 'Member' LIMIT 1",
      [memberUuid],
    );
    const member = (rows as MemberTargetRow[])?.[0];
    if (!member) {
      throw new Error("Selected member was not found");
    }
    return {
      members: [member],
      label: `${member.name} (${member.user_id})`,
    };
  }

  const where =
    scope === "all"
      ? "WHERE user_type = 'Member'"
      : scope === "active"
        ? "WHERE user_type = 'Member' AND is_active = 1"
        : "WHERE user_type = 'Member' AND is_active = 0";
  const [rows] = await conn.query<MemberTargetRow[]>(
    `SELECT uuid, user_id, name FROM members ${where} ORDER BY created_at DESC`,
  );
  const members = (rows as MemberTargetRow[]) ?? [];
  const labelPrefix =
    scope === "all" ? "All Members" : scope === "active" ? "Active Members" : "Inactive Members";

  return {
    members,
    label: `${labelPrefix} (${members.length})`,
  };
}

router.get("/list/", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;

    const [countResult] = await pool.query("SELECT COUNT(*) AS total FROM notifications");
    const total = Number((countResult as { total: number }[])?.[0]?.total ?? 0);

    const [rows] = await pool.query(
      `SELECT n.uuid, n.title, n.message, n.type, n.recipient_scope, n.recipient_label, n.recipient_count, n.created_at,
              m.name AS created_by_name
       FROM notifications n
       LEFT JOIN members m ON m.uuid = n.created_by_uuid
       ORDER BY n.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset],
    );

    const results = ((rows as NotificationRow[]) ?? []).map(rowToSentNotification);

    res.json({
      count: total,
      next: offset + results.length < total ? `?limit=${limit}&offset=${offset + limit}` : null,
      previous: offset > 0 ? `?limit=${limit}&offset=${Math.max(0, offset - limit)}` : null,
      results,
    });
  } catch (err) {
    console.error("List notifications error:", err);
    res.status(500).json({ detail: "Failed to list notifications" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  const conn = (await pool.getConnection()) as unknown as TransactionalConnection;
  try {
    if (!ensureAdmin(req, res)) return;

    const body = req.body as Record<string, unknown>;
    const title = String(body.title ?? "").trim();
    const message = String(body.message ?? "").trim();
    const type = NOTIFICATION_TYPES.includes(String(body.type ?? "General") as NotificationType)
      ? (String(body.type) as NotificationType)
      : "General";
    const recipient_scope = RECIPIENT_SCOPES.includes(String(body.recipient_scope ?? "all") as RecipientScope)
      ? (String(body.recipient_scope) as RecipientScope)
      : "all";
    const member_uuid = body.member_uuid != null ? String(body.member_uuid).trim() : null;

    if (!title || !message) {
      return res.status(400).json({ detail: "Title and message are required" });
    }
    if (recipient_scope === "custom" && !member_uuid) {
      return res.status(400).json({ detail: "A member must be selected for custom notifications" });
    }

    await conn.beginTransaction();

    const { members, label } = await getRecipientMembers(conn, recipient_scope, member_uuid);
    if (members.length === 0) {
      await conn.rollback();
      return res.status(400).json({ detail: "No members matched the selected recipient group" });
    }

    const notificationUuid = uuidv4();
    const createdByUuid = getRequestUser(req)?.sub ?? null;
    await conn.query(
      `INSERT INTO notifications (
        uuid, title, message, type, recipient_scope, recipient_label, recipient_count, created_by_uuid
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [notificationUuid, title, message, type, recipient_scope, label, members.length, createdByUuid],
    );

    const values = members
      .map(() => "(?, ?, ?)")
      .join(", ");
    const params = members.flatMap((member) => [uuidv4(), notificationUuid, member.uuid]);
    await conn.query(
      `INSERT INTO notification_recipients (uuid, notification_uuid, member_uuid) VALUES ${values}`,
      params,
    );

    await conn.commit();

    const [rows] = await conn.query(
      `SELECT n.uuid, n.title, n.message, n.type, n.recipient_scope, n.recipient_label, n.recipient_count, n.created_at,
              m.name AS created_by_name
       FROM notifications n
       LEFT JOIN members m ON m.uuid = n.created_by_uuid
       WHERE n.uuid = ?`,
      [notificationUuid],
    );
    const row = (rows as NotificationRow[])?.[0];
    res.status(201).json(
      row
        ? rowToSentNotification(row)
        : {
            id: notificationUuid,
            uuid: notificationUuid,
            title,
            message,
            type,
            recipient_scope,
            recipients: label,
            delivered: members.length,
            created_at: new Date().toISOString(),
          },
    );
  } catch (err) {
    await conn.rollback();
    const detail = err instanceof Error ? err.message : "Failed to send notification";
    console.error("Create notification error:", err);
    res.status(detail === "Selected member was not found" ? 404 : 500).json({ detail });
  } finally {
    conn.release();
  }
});

router.get("/me/", requireAuth, async (req: Request, res: Response) => {
  try {
    const memberUuid = ensureAuthenticatedUser(req, res);
    if (!memberUuid) return;

    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;

    const [countResult] = await pool.query(
      "SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END), 0) AS unread_count FROM notification_recipients WHERE member_uuid = ?",
      [memberUuid],
    );
    const summary = (countResult as { total: number; unread_count: number }[])?.[0];
    const total = Number(summary?.total ?? 0);
    const unread_count = Number(summary?.unread_count ?? 0);

    const [rows] = await pool.query(
      `SELECT nr.uuid AS recipient_uuid, nr.notification_uuid, nr.is_read, nr.read_at, n.title, n.message, n.type, n.recipient_scope, n.recipient_label, n.created_at
       FROM notification_recipients nr
       INNER JOIN notifications n ON n.uuid = nr.notification_uuid
       WHERE nr.member_uuid = ?
       ORDER BY n.created_at DESC, nr.created_at DESC
       LIMIT ? OFFSET ?`,
      [memberUuid, limit, offset],
    );

    const results = ((rows as RecipientRow[]) ?? []).map(rowToReceivedNotification);

    res.json({
      count: total,
      unread_count,
      next: offset + results.length < total ? `?limit=${limit}&offset=${offset + limit}` : null,
      previous: offset > 0 ? `?limit=${limit}&offset=${Math.max(0, offset - limit)}` : null,
      results,
    });
  } catch (err) {
    console.error("Get my notifications error:", err);
    res.status(500).json({ detail: "Failed to get notifications" });
  }
});

router.patch("/me/read-all/", requireAuth, async (req: Request, res: Response) => {
  try {
    const memberUuid = ensureAuthenticatedUser(req, res);
    if (!memberUuid) return;

    const [result] = await pool.query(
      `UPDATE notification_recipients
       SET is_read = 1, read_at = COALESCE(read_at, NOW())
       WHERE member_uuid = ? AND is_read = 0`,
      [memberUuid],
    );
    const affectedRows = (result as { affectedRows: number }).affectedRows ?? 0;
    res.json({
      detail: affectedRows > 0 ? "All notifications marked as read" : "No unread notifications found",
      updated: affectedRows,
    });
  } catch (err) {
    console.error("Mark all notifications read error:", err);
    res.status(500).json({ detail: "Failed to update notifications" });
  }
});

router.patch("/me/:recipientUuid/read/", requireAuth, async (req: Request, res: Response) => {
  try {
    const memberUuid = ensureAuthenticatedUser(req, res);
    if (!memberUuid) return;

    const recipientUuid = req.params.recipientUuid;
    const [result] = await pool.query(
      `UPDATE notification_recipients
       SET is_read = 1, read_at = COALESCE(read_at, NOW())
       WHERE uuid = ? AND member_uuid = ?`,
      [recipientUuid, memberUuid],
    );
    const affectedRows = (result as { affectedRows: number }).affectedRows ?? 0;
    if (affectedRows === 0) {
      return res.status(404).json({ detail: "Notification not found" });
    }
    res.json({ detail: "Notification marked as read" });
  } catch (err) {
    console.error("Mark notification read error:", err);
    res.status(500).json({ detail: "Failed to update notification" });
  }
});

export default router;
