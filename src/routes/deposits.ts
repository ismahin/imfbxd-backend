import { Router, Request, Response } from "express";
import pool from "../db/pool.js";
import { v4 as uuidv4 } from "uuid";

const router = Router();

type DepositRow = {
  id: number;
  uuid: string;
  member_uuid: string;
  amount: number;
  channel: string;
  deposit_date: string;
  status: string;
  created_at: Date;
  member_name?: string;
  member_user_id?: string;
  member_phone?: string;
  member_email?: string;
};

function rowToDeposit(row: DepositRow) {
  return {
    id: row.uuid,
    uuid: row.uuid,
    member_uuid: row.member_uuid,
    member_id: row.member_user_id,
    member_name: row.member_name,
    phone: row.member_phone,
    email: row.member_email,
    amount: Number(row.amount),
    channel: row.channel,
    date: row.deposit_date,
    deposit_date: row.deposit_date,
    status: row.status,
    created_at: row.created_at?.toISOString?.() ?? undefined,
  };
}

// GET /api/web/v1/deposits/list/ — list all deposits (optional member_uuid, limit, offset)
router.get("/list/", async (req: Request, res: Response) => {
  try {
    const member_uuid = req.query.member_uuid as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;

    let countSql = "SELECT COUNT(*) AS total FROM deposits";
    let listSql = `
      SELECT d.uuid, d.member_uuid, d.amount, d.channel, d.deposit_date, d.status, d.created_at,
             m.name AS member_name, m.user_id AS member_user_id, m.phone AS member_phone, m.email AS member_email
      FROM deposits d
      INNER JOIN members m ON m.uuid = d.member_uuid
    `;
    const params: unknown[] = [];
    if (member_uuid) {
      countSql += " WHERE member_uuid = ?";
      listSql += " WHERE d.member_uuid = ?";
      params.push(member_uuid);
    }
    listSql += " ORDER BY d.deposit_date DESC, d.created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const [countResult] = await pool.query(countSql, member_uuid ? [member_uuid] : []);
    const total = Number((countResult as { total: number }[])?.[0]?.total ?? 0);

    const [listResult] = await pool.query(listSql, params);
    const results = ((listResult as DepositRow[]) || []).map(rowToDeposit);

    res.json({
      count: total,
      next: offset + results.length < total ? `?limit=${limit}&offset=${offset + limit}` : null,
      previous: offset > 0 ? `?limit=${limit}&offset=${Math.max(0, offset - limit)}` : null,
      results,
    });
  } catch (err) {
    console.error("List deposits error:", err);
    res.status(500).json({ detail: "Failed to list deposits" });
  }
});

// GET /api/web/v1/deposits/stats/ — aggregate totals for dashboard (Completed only)
router.get("/stats/", async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<{ total_deposit: number; monthly_deposit: number; yearly_deposit: number }[]>(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'Completed' THEN amount ELSE 0 END), 0) AS total_deposit,
        COALESCE(SUM(CASE WHEN status = 'Completed' AND YEAR(deposit_date) = YEAR(CURDATE()) AND MONTH(deposit_date) = MONTH(CURDATE()) THEN amount ELSE 0 END), 0) AS monthly_deposit,
        COALESCE(SUM(CASE WHEN status = 'Completed' AND YEAR(deposit_date) = YEAR(CURDATE()) THEN amount ELSE 0 END), 0) AS yearly_deposit
       FROM deposits`
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    res.json({
      total_deposit: Number(row?.total_deposit ?? 0),
      monthly_deposit: Number(row?.monthly_deposit ?? 0),
      yearly_deposit: Number(row?.yearly_deposit ?? 0),
    });
  } catch (err) {
    console.error("Deposit stats error:", err);
    res.status(500).json({ detail: "Failed to get deposit stats" });
  }
});

// GET /api/web/v1/deposits/:uuid/
router.get("/:uuid/", async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.uuid, d.member_uuid, d.amount, d.channel, d.deposit_date, d.status, d.created_at,
              m.name AS member_name, m.user_id AS member_user_id, m.phone AS member_phone, m.email AS member_email
       FROM deposits d
       INNER JOIN members m ON m.uuid = d.member_uuid
       WHERE d.uuid = ?`,
      [req.params.uuid]
    );
    const row = (rows as DepositRow[])?.[0];
    if (!row) return res.status(404).json({ detail: "Deposit not found" });
    res.json(rowToDeposit(row));
  } catch (err) {
    console.error("Get deposit error:", err);
    res.status(500).json({ detail: "Failed to get deposit" });
  }
});

// POST /api/web/v1/deposits/
router.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const member_uuid = String(body.member_uuid ?? "").trim();
    const amount = Number(body.amount);
    const channel = String(body.channel ?? "Cash").trim();
    const deposit_date = String(body.deposit_date ?? body.date ?? "").trim();
    const statusRaw = body.status ?? "Completed";
    const status = ["Completed", "Pending", "Failed"].includes(String(statusRaw))
      ? String(statusRaw)
      : "Completed";

    if (!member_uuid || !deposit_date) {
      return res.status(400).json({ detail: "member_uuid and deposit_date are required" });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ detail: "amount must be a positive number" });
    }

    const [memberRows] = await pool.query("SELECT uuid FROM members WHERE uuid = ?", [member_uuid]);
    if (!(memberRows as { uuid: string }[])?.[0]) {
      return res.status(404).json({ detail: "Member not found" });
    }

    const uuid = uuidv4();
    await pool.query(
      "INSERT INTO deposits (uuid, member_uuid, amount, channel, deposit_date, status) VALUES (?, ?, ?, ?, ?, ?)",
      [uuid, member_uuid, amount, channel, deposit_date, status]
    );

    const [rows] = await pool.query(
      `SELECT d.uuid, d.member_uuid, d.amount, d.channel, d.deposit_date, d.status, d.created_at,
              m.name AS member_name, m.user_id AS member_user_id, m.phone AS member_phone, m.email AS member_email
       FROM deposits d
       INNER JOIN members m ON m.uuid = d.member_uuid
       WHERE d.uuid = ?`,
      [uuid]
    );
    const row = (rows as DepositRow[])?.[0];
    if (!row) return res.status(500).json({ detail: "Deposit created but fetch failed" });
    res.status(201).json(rowToDeposit(row));
  } catch (err) {
    console.error("Create deposit error:", err);
    res.status(500).json({ detail: "Failed to create deposit" });
  }
});

// PATCH /api/web/v1/deposits/:uuid/
router.patch("/:uuid/", async (req: Request, res: Response) => {
  try {
    const uuid = req.params.uuid;
    const body = req.body as Record<string, unknown>;

    const [existing] = await pool.query("SELECT id FROM deposits WHERE uuid = ?", [uuid]);
    if (!(existing as { id: number }[])?.[0]) {
      return res.status(404).json({ detail: "Deposit not found" });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    if (body.amount !== undefined && Number.isFinite(Number(body.amount))) {
      updates.push("amount = ?");
      values.push(Number(body.amount));
    }
    if (body.channel !== undefined) {
      updates.push("channel = ?");
      values.push(String(body.channel));
    }
    if (body.deposit_date !== undefined || body.date !== undefined) {
      updates.push("deposit_date = ?");
      values.push(String(body.deposit_date ?? body.date ?? ""));
    }
    if (body.status !== undefined && ["Completed", "Pending", "Failed"].includes(String(body.status))) {
      updates.push("status = ?");
      values.push(body.status);
    }

    if (updates.length > 0) {
      values.push(uuid);
      await pool.query(`UPDATE deposits SET ${updates.join(", ")} WHERE uuid = ?`, values);
    }

    const [rows] = await pool.query(
      `SELECT d.uuid, d.member_uuid, d.amount, d.channel, d.deposit_date, d.status, d.created_at,
              m.name AS member_name, m.user_id AS member_user_id, m.phone AS member_phone, m.email AS member_email
       FROM deposits d
       INNER JOIN members m ON m.uuid = d.member_uuid
       WHERE d.uuid = ?`,
      [uuid]
    );
    const row = (rows as DepositRow[])?.[0];
    if (!row) return res.status(404).json({ detail: "Deposit not found" });
    res.json(rowToDeposit(row));
  } catch (err) {
    console.error("Update deposit error:", err);
    res.status(500).json({ detail: "Failed to update deposit" });
  }
});

// DELETE /api/web/v1/deposits/:uuid/
router.delete("/:uuid/", async (req: Request, res: Response) => {
  try {
    const [result] = await pool.query("DELETE FROM deposits WHERE uuid = ?", [req.params.uuid]);
    const affected = (result as { affectedRows: number }).affectedRows;
    if (affected === 0) return res.status(404).json({ detail: "Deposit not found" });
    res.status(204).send();
  } catch (err) {
    console.error("Delete deposit error:", err);
    res.status(500).json({ detail: "Failed to delete deposit" });
  }
});

export default router;
