import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import pool from "../db/pool.js";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import imagekit from "../services/imageKitClient.js";
import { requireAuth, optionalDecode, type JwtPayload } from "../middleware/auth.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = /^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype);
    if (allowed) cb(null, true);
    else cb(new Error("Only JPEG, PNG, GIF, and WebP images are allowed"));
  },
});

async function saveProfilePicture(uuid: string, file: Express.Multer.File): Promise<string> {
  const ext = path.extname(file.originalname) || ".jpg";
  const safeExt = /^\.(jpe?g|png|gif|webp)$/i.test(ext) ? ext : ".jpg";
  const filename = `${uuid}${safeExt}`;

  const uploadResult = await imagekit.upload({
    file: file.buffer,
    fileName: filename,
    folder: "/imfbxd/members",
  });

  return uploadResult.url;
}

function maybeMulter(req: Request, res: Response, next: (err?: unknown) => void) {
  const contentType = req.headers["content-type"] || "";
  if (contentType.startsWith("multipart/form-data")) {
    return upload.single("profile_picture")(req, res, (err?: unknown) => {
      if (err) {
        console.error("Multer error:", err);
        return res.status(400).json({ detail: err instanceof Error ? err.message : "File upload failed" });
      }
      next();
    });
  }
  next();
}

type MemberRow = {
  id?: number;
  uuid: string;
  user_id: string;
  email: string;
  name: string;
  phone: string | null;
  nid_number: string | null;
  date_of_birth: string | null;
  account_number: string | null;
  beneficiary_ref_id: string | null;
  nominee_name: string | null;
  nominee_phone: string | null;
  nominee_nid_number: string | null;
  nominee_account_number: string | null;
  nominee_date_of_birth: string | null;
  current_address: string | null;
  permanent_address: string | null;
  nominee_address: string | null;
  profile_picture: string | null;
  user_type: string;
  is_active: number;
  joining_date: string | null;
  created_at: Date;
  total_deposits?: string;
  invest_amount?: string;
  referral_count?: number | string;
};

type ReferralRow = {
  uuid: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string;
};

const MEMBER_SELECT_FIELDS = `
  m.uuid,
  m.user_id,
  m.email,
  m.name,
  m.phone,
  m.nid_number,
  m.date_of_birth,
  m.account_number,
  m.beneficiary_ref_id,
  m.nominee_name,
  m.nominee_phone,
  m.nominee_nid_number,
  m.nominee_account_number,
  m.nominee_date_of_birth,
  m.current_address,
  m.permanent_address,
  m.nominee_address,
  m.profile_picture,
  m.user_type,
  m.is_active,
  m.joining_date,
  m.created_at
`.trim();

const MEMBER_SELECT_FIELDS_PLAIN = MEMBER_SELECT_FIELDS.replaceAll("m.", "");

function optionalText(value: unknown): string | null {
  return value != null ? String(value).trim() : null;
}

function optionalDate(value: unknown): string | null {
  if (value == null) return null;
  const parsed = String(value).trim();
  return parsed ? parsed : null;
}

function mapReferralRow(row: ReferralRow) {
  return {
    uuid: row.uuid,
    user_id: row.user_id,
    name: row.name,
    phone: row.phone ?? undefined,
    email: row.email,
  };
}

function rowToMember(row: MemberRow) {
  return {
    uuid: row.uuid,
    email: row.email,
    name: row.name,
    phone: row.phone ?? undefined,
    nid_number: row.nid_number ?? undefined,
    date_of_birth: row.date_of_birth ?? undefined,
    user_id: row.user_id,
    account_number: row.account_number ?? undefined,
    beneficiary_ref_id: row.beneficiary_ref_id ?? null,
    nominee_name: row.nominee_name ?? undefined,
    nominee_phone: row.nominee_phone ?? undefined,
    nominee_nid_number: row.nominee_nid_number ?? undefined,
    nominee_account_number: row.nominee_account_number ?? undefined,
    nominee_date_of_birth: row.nominee_date_of_birth ?? undefined,
    current_address: row.current_address ?? undefined,
    permanent_address: row.permanent_address ?? undefined,
    nominee_address: row.nominee_address ?? undefined,
    profile_picture: row.profile_picture ?? undefined,
    user_type: row.user_type,
    is_active: Boolean(row.is_active),
    joining_date: row.joining_date ?? undefined,
    created_at: row.created_at?.toISOString?.() ?? undefined,
    total_deposits: row.total_deposits != null ? String(row.total_deposits) : "0",
    invest_amount: row.invest_amount ?? "0",
    referral_count:
      row.referral_count != null
        ? Number(row.referral_count)
        : 0,
  };
}

async function nextUserId(): Promise<string> {
  const [rows] = await pool.query(
    "SELECT COALESCE(MAX(CAST(SUBSTRING(user_id, 4) AS UNSIGNED)), 0) AS max_id FROM members WHERE user_id REGEXP '^IMF[0-9]+$'"
  );
  const maxId = Number((rows as { max_id: number }[])?.[0]?.max_id ?? 0);
  return `IMF${String(maxId + 1).padStart(5, "0")}`;
}

// GET /api/web/v1/users/list/
router.get("/list/", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;

    const [countResult] = await pool.query("SELECT COUNT(*) AS total FROM members");
    const total = Number((countResult as { total: number }[])?.[0]?.total ?? 0);

    const [listResult] = await pool.query(
      `SELECT ${MEMBER_SELECT_FIELDS},
       COALESCE((SELECT SUM(d.amount) FROM deposits d WHERE d.member_uuid = m.uuid), 0) AS total_deposits,
       COALESCE((SELECT COUNT(*) FROM members r WHERE r.beneficiary_ref_id = m.user_id), 0) AS referral_count
       FROM members m ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const results = ((listResult as MemberRow[]) || []).map((r) => rowToMember(r));

    res.json({
      count: total,
      next: offset + results.length < total ? `?limit=${limit}&offset=${offset + limit}` : null,
      previous: offset > 0 ? `?limit=${limit}&offset=${Math.max(0, offset - limit)}` : null,
      results,
    });
  } catch (err) {
    console.error("List members error:", err);
    res.status(500).json({ detail: "Failed to list members" });
  }
});

// GET /api/web/v1/users/me/ — current user profile (requires valid JWT)
router.get("/me/", requireAuth, async (req: Request, res: Response) => {
  try {
    const payload = (req as Request & { user?: { sub: string } }).user;
    const uuid = payload?.sub;
    if (!uuid) {
      return res.status(401).json({ detail: "Authentication required" });
    }
    const [getResult] = await pool.query(
      `SELECT ${MEMBER_SELECT_FIELDS},
       COALESCE((SELECT SUM(d.amount) FROM deposits d WHERE d.member_uuid = m.uuid), 0) AS total_deposits,
       COALESCE((SELECT COUNT(*) FROM members r WHERE r.beneficiary_ref_id = m.user_id), 0) AS referral_count
       FROM members m WHERE m.uuid = ?`,
      [uuid]
    );
    const row = (getResult as MemberRow[])?.[0];
    if (!row) {
      return res.status(404).json({ detail: "User not found" });
    }
    const [refRows] = await pool.query<ReferralRow[]>(
      "SELECT uuid, user_id, name, phone, email FROM members WHERE beneficiary_ref_id = ? ORDER BY created_at DESC",
      [row.user_id]
    );
    const referrals = Array.isArray(refRows) ? refRows.map(mapReferralRow) : [];
    res.json({ ...rowToMember(row), referrals });
  } catch (err) {
    console.error("Get me error:", err);
    res.status(500).json({ detail: "Failed to get profile" });
  }
});

// GET /api/web/v1/users/:uuid/
router.get("/:uuid/", async (req: Request, res: Response) => {
  try {
    const [getResult] = await pool.query(
      `SELECT ${MEMBER_SELECT_FIELDS},
       COALESCE((SELECT SUM(d.amount) FROM deposits d WHERE d.member_uuid = m.uuid), 0) AS total_deposits,
       COALESCE((SELECT COUNT(*) FROM members r WHERE r.beneficiary_ref_id = m.user_id), 0) AS referral_count
       FROM members m WHERE m.uuid = ?`,
      [req.params.uuid]
    );
    const row = (getResult as MemberRow[])?.[0];
    if (!row) {
      return res.status(404).json({ detail: "Member not found" });
    }
    const [refRows] = await pool.query<ReferralRow[]>(
      "SELECT uuid, user_id, name, phone, email FROM members WHERE beneficiary_ref_id = ? ORDER BY created_at DESC",
      [row.user_id]
    );
    const referrals = Array.isArray(refRows) ? refRows.map(mapReferralRow) : [];
    res.json({ ...rowToMember(row), referrals });
  } catch (err) {
    console.error("Get member error:", err);
    res.status(500).json({ detail: "Failed to get member" });
  }
});

// POST /api/web/v1/users/
router.post("/", maybeMulter, async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const email = String(body.email ?? "").trim();
    const name = String(body.name ?? "").trim();
    const password = String(body.password ?? "");
    const phone = optionalText(body.phone);
    const nid_number = optionalText(body.nid_number);
    const date_of_birth = optionalDate(body.date_of_birth);
    const account_number = optionalText(body.account_number);
    const nominee_name = optionalText(body.nominee_name);
    const nominee_phone = optionalText(body.nominee_phone);
    const nominee_nid_number = optionalText(body.nominee_nid_number);
    const nominee_account_number = optionalText(body.nominee_account_number);
    const nominee_date_of_birth = optionalDate(body.nominee_date_of_birth);
    const permanent_address = optionalText(body.permanent_address);
    const current_address = optionalText(body.current_address);
    const nominee_address = optionalText(body.nominee_address);
    const beneficiary_ref_id = optionalText(body.beneficiary_ref_id);
    const user_type = ["Admin", "Member"].includes(String(body.user_type ?? "Member")) ? String(body.user_type) : "Member";
    const joining_date = optionalDate(body.joining_date);

    if (!email || !name || !password) {
      return res.status(400).json({ detail: "email, name and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ detail: "Password must be at least 8 characters" });
    }

    const [existing] = await pool.query("SELECT COUNT(*) AS count FROM members WHERE email = ?", [email]);
    if (Number((existing as { count: number }[])?.[0]?.count ?? 0) > 0) {
      return res.status(409).json({ detail: "Email already registered" });
    }

    const uuid = uuidv4();
    const user_id = await nextUserId();
    const password_hash = await bcrypt.hash(password, 10);

    let profile_picture: string | null = null;
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (file) {
      try {
        profile_picture = await saveProfilePicture(uuid, file);
      } catch (err) {
        console.error("Profile picture save error:", err);
      }
    }

    await pool.query(
      `INSERT INTO members (
        uuid, user_id, email, password_hash, name, phone, nid_number, date_of_birth, account_number, beneficiary_ref_id,
        nominee_name, nominee_phone, nominee_nid_number, nominee_account_number, nominee_date_of_birth,
        current_address, permanent_address, nominee_address, profile_picture, user_type, joining_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        user_id,
        email,
        password_hash,
        name,
        phone,
        nid_number,
        date_of_birth,
        account_number,
        beneficiary_ref_id,
        nominee_name,
        nominee_phone,
        nominee_nid_number,
        nominee_account_number,
        nominee_date_of_birth,
        current_address,
        permanent_address,
        nominee_address,
        profile_picture,
        user_type,
        joining_date,
      ]
    );

    const [createResult] = await pool.query(
      `SELECT ${MEMBER_SELECT_FIELDS_PLAIN}
       FROM members WHERE uuid = ?`,
      [uuid]
    );
    const row = (createResult as MemberRow[])?.[0];
    if (!row) {
      return res.status(500).json({ detail: "Member created but fetch failed" });
    }
    res.status(201).json(rowToMember(row));
  } catch (err) {
    console.error("Create member error:", err);
    res.status(500).json({ detail: "Failed to create member" });
  }
});

// PATCH /api/web/v1/users/:uuid/update/ — self (own profile) or Admin can update
router.patch("/:uuid/update/", optionalDecode, maybeMulter, async (req: Request, res: Response) => {
  try {
    const uuid = req.params.uuid;
    const body = req.body as Record<string, unknown>;
    const user = (req as Request & { user?: JwtPayload }).user;

    if (process.env.NODE_ENV === "production" && !user) {
      return res.status(401).json({ detail: "Authentication required" });
    }
    const isSelf = user?.sub === uuid;
    const isAdmin = user?.user_type === "Admin";
    if (user && !isSelf && !isAdmin) {
      return res.status(403).json({ detail: "You can only update your own profile" });
    }

    const [existing] = await pool.query("SELECT id, email FROM members WHERE uuid = ?", [uuid]);
    const existingRow = (existing as { id: number; email: string }[])?.[0];
    if (!existingRow) {
      return res.status(404).json({ detail: "Member not found" });
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (file) {
      try {
        const profile_picture = await saveProfilePicture(uuid, file);
        updates.push("profile_picture = ?");
        values.push(profile_picture);
      } catch (err) {
        console.error("Profile picture save error:", err);
      }
    }

    const allAllowed = [
      "name",
      "email",
      "phone",
      "nid_number",
      "date_of_birth",
      "account_number",
      "nominee_name",
      "nominee_phone",
      "nominee_nid_number",
      "nominee_account_number",
      "nominee_date_of_birth",
      "permanent_address",
      "current_address",
      "nominee_address",
      "beneficiary_ref_id",
      "user_type",
      "joining_date",
      "is_active",
    ] as const;
    const selfAllowed = ["name", "email", "phone"] as const;
    const allowed = isSelf ? selfAllowed : allAllowed;
    const dateFields = new Set(["joining_date", "date_of_birth", "nominee_date_of_birth"]);

    if (body.email !== undefined && body.email !== existingRow.email) {
      const newEmail = String(body.email).trim();
      if (!newEmail) {
        return res.status(400).json({ detail: "Email cannot be empty" });
      }
      const [dup] = await pool.query("SELECT 1 FROM members WHERE email = ? AND uuid != ?", [newEmail, uuid]);
      if ((dup as unknown[]).length > 0) {
        return res.status(409).json({ detail: "Email already in use" });
      }
    }

    for (const key of allowed) {
      if (key in body) {
        if (key === "is_active") {
          updates.push("is_active = ?");
          values.push(body[key] === true || body[key] === "true" || body[key] === 1 ? 1 : 0);
        } else if (key === "user_type" && ["Admin", "Member"].includes(String(body[key]))) {
          updates.push("user_type = ?");
          values.push(body[key]);
        } else if (key === "email") {
          updates.push("email = ?");
          values.push(optionalText(body[key]));
        } else if (dateFields.has(key)) {
          updates.push(`${key} = ?`);
          values.push(optionalDate(body[key]));
        } else {
          updates.push(`${key} = ?`);
          values.push(optionalText(body[key]));
        }
      }
    }

    if (body.password != null && String(body.password).trim().length > 0) {
      updates.push("password_hash = ?");
      values.push(await bcrypt.hash(String(body.password), 10));
    }

    if (updates.length === 0) {
      const [noUpdateResult] = await pool.query(
        `SELECT ${MEMBER_SELECT_FIELDS_PLAIN}
         FROM members WHERE uuid = ?`,
        [uuid]
      );
      const row = (noUpdateResult as MemberRow[])?.[0];
      return row ? res.json(rowToMember(row)) : res.status(404).json({ detail: "Member not found" });
    }

    values.push(uuid);
    await pool.query(`UPDATE members SET ${updates.join(", ")} WHERE uuid = ?`, values);

    const [updateResult] = await pool.query(
      `SELECT ${MEMBER_SELECT_FIELDS_PLAIN}
       FROM members WHERE uuid = ?`,
      [uuid]
    );
    const row = (updateResult as MemberRow[])?.[0];
    if (!row) {
      return res.status(500).json({ detail: "Update succeeded but fetch failed" });
    }
    res.json(rowToMember(row));
  } catch (err) {
    console.error("Update member error:", err);
    res.status(500).json({ detail: "Failed to update member" });
  }
});

// DELETE /api/web/v1/users/:uuid/
router.delete("/:uuid/", async (req: Request, res: Response) => {
  try {
    const [result] = await pool.query("DELETE FROM members WHERE uuid = ?", [req.params.uuid]);
    const affected = (result as { affectedRows: number }).affectedRows;
    if (affected === 0) {
      return res.status(404).json({ detail: "Member not found" });
    }
    res.status(204).send();
  } catch (err) {
    console.error("Delete member error:", err);
    res.status(500).json({ detail: "Failed to delete member" });
  }
});

export default router;
