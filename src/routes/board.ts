import { Router, Request, Response } from "express";
import multer from "multer";
import fs from "fs/promises";
import path from "path";
import pool from "../db/pool.js";
import { v4 as uuidv4 } from "uuid";

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

const UPLOADS_BOARD = path.join(process.cwd(), "uploads", "board");

async function saveProfilePicture(uuid: string, file: Express.Multer.File): Promise<string> {
  await fs.mkdir(UPLOADS_BOARD, { recursive: true });
  const ext = path.extname(file.originalname) || ".jpg";
  const safeExt = /^\.(jpe?g|png|gif|webp)$/i.test(ext) ? ext : ".jpg";
  const filename = `${uuid}${safeExt}`;
  const filepath = path.join(UPLOADS_BOARD, filename);
  await fs.writeFile(filepath, file.buffer);
  return `/uploads/board/${filename}`;
}

function maybeMulter(req: Request, res: Response, next: (err?: unknown) => void) {
  const contentType = req.headers["content-type"] || "";
  if (contentType.startsWith("multipart/form-data")) {
    return upload.single("profile_picture")(req, res, (err?: unknown) => {
      if (err) {
        console.error("Board multer error:", err);
        return res.status(400).json({ detail: err instanceof Error ? err.message : "File upload failed" });
      }
      next();
    });
  }
  next();
}

type BoardRow = {
  id: number;
  uuid: string;
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
  since: string | null;
  bio: string | null;
  display_order: number;
  district: string | null;
  profile_picture: string | null;
  created_at: Date;
};

function rowToMember(row: BoardRow) {
  return {
    id: row.uuid,
    uuid: row.uuid,
    name: row.name,
    role: row.role,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    since: row.since ?? undefined,
    bio: row.bio ?? undefined,
    order: row.display_order,
    district: row.district ?? undefined,
    profile_picture: row.profile_picture ?? undefined,
    created_at: row.created_at?.toISOString?.() ?? undefined,
  };
}

// GET /api/web/v1/board/list/ — list all, ordered by display_order
router.get("/list/", async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      "SELECT uuid, name, role, phone, email, since, bio, display_order, district, profile_picture, created_at FROM board_members ORDER BY display_order ASC, created_at ASC"
    );
    const results = ((rows as BoardRow[]) || []).map(rowToMember);
    res.json({
      count: results.length,
      next: null,
      previous: null,
      results,
    });
  } catch (err) {
    console.error("Board list error:", err);
    res.status(500).json({ detail: "Failed to list board members" });
  }
});

// GET /api/web/v1/board/:uuid/
router.get("/:uuid/", async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      "SELECT uuid, name, role, phone, email, since, bio, display_order, district, profile_picture, created_at FROM board_members WHERE uuid = ?",
      [req.params.uuid]
    );
    const row = (rows as BoardRow[])?.[0];
    if (!row) return res.status(404).json({ detail: "Board member not found" });
    res.json(rowToMember(row));
  } catch (err) {
    console.error("Board get error:", err);
    res.status(500).json({ detail: "Failed to get board member" });
  }
});

// POST /api/web/v1/board/ — create (optional multipart profile_picture)
router.post("/", maybeMulter, async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    const role = String(body.role ?? "").trim();
    if (!name || !role) return res.status(400).json({ detail: "Name and role are required" });

    const uuid = uuidv4();
    let profile_picture: string | null = null;
    if (req.file) {
      profile_picture = await saveProfilePicture(uuid, req.file);
    }

    const phone = body.phone != null ? String(body.phone).trim() : null;
    const email = body.email != null ? String(body.email).trim() : null;
    const since = body.since != null ? String(body.since).trim() : null;
    const bio = body.bio != null ? String(body.bio).trim() : null;
    const display_order = Math.max(0, Number(body.order ?? body.display_order ?? 0));
    const district = body.district != null ? String(body.district).trim() : null;

    await pool.query(
      "INSERT INTO board_members (uuid, name, role, phone, email, since, bio, display_order, district, profile_picture) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [uuid, name, role, phone, email, since, bio, display_order, district, profile_picture]
    );

    const [rows] = await pool.query(
      "SELECT uuid, name, role, phone, email, since, bio, display_order, district, profile_picture, created_at FROM board_members WHERE uuid = ?",
      [uuid]
    );
    const row = (rows as BoardRow[])?.[0];
    res.status(201).json(row ? rowToMember(row) : { id: uuid, uuid, name, role, phone, email, since, bio, order: display_order, district, profile_picture });
  } catch (err) {
    console.error("Board create error:", err);
    res.status(500).json({ detail: "Failed to create board member" });
  }
});

// PATCH /api/web/v1/board/:uuid/ — update (optional multipart profile_picture)
router.patch("/:uuid/", maybeMulter, async (req: Request, res: Response) => {
  try {
    const uuid = req.params.uuid;
    const body = req.body as Record<string, unknown>;

    const [existing] = await pool.query(
      "SELECT uuid, name, role, phone, email, since, bio, display_order, district, profile_picture FROM board_members WHERE uuid = ?",
      [uuid]
    );
    const row = (existing as BoardRow[])?.[0];
    if (!row) return res.status(404).json({ detail: "Board member not found" });

    let profile_picture: string | null = row.profile_picture;
    if (req.file) {
      profile_picture = await saveProfilePicture(uuid, req.file);
    }

    const name = body.name != null ? String(body.name).trim() : row.name;
    const role = body.role != null ? String(body.role).trim() : row.role;
    const phone = body.phone !== undefined ? (body.phone != null ? String(body.phone).trim() : null) : row.phone;
    const email = body.email !== undefined ? (body.email != null ? String(body.email).trim() : null) : row.email;
    const since = body.since !== undefined ? (body.since != null ? String(body.since).trim() : null) : row.since;
    const bio = body.bio !== undefined ? (body.bio != null ? String(body.bio).trim() : null) : row.bio;
    const display_order = body.order !== undefined || body.display_order !== undefined
      ? Math.max(0, Number(body.order ?? body.display_order ?? row.display_order))
      : row.display_order;
    const district = body.district !== undefined ? (body.district != null ? String(body.district).trim() : null) : row.district;

    await pool.query(
      "UPDATE board_members SET name = ?, role = ?, phone = ?, email = ?, since = ?, bio = ?, display_order = ?, district = ?, profile_picture = ? WHERE uuid = ?",
      [name, role, phone, email, since, bio, display_order, district, profile_picture, uuid]
    );

    const [rows] = await pool.query(
      "SELECT uuid, name, role, phone, email, since, bio, display_order, district, profile_picture, created_at FROM board_members WHERE uuid = ?",
      [uuid]
    );
    const updated = (rows as BoardRow[])?.[0];
    res.json(updated ? rowToMember(updated) : { id: uuid, uuid, name, role, phone, email, since, bio, order: display_order, district, profile_picture });
  } catch (err) {
    console.error("Board update error:", err);
    res.status(500).json({ detail: "Failed to update board member" });
  }
});

// DELETE /api/web/v1/board/:uuid/
router.delete("/:uuid/", async (req: Request, res: Response) => {
  try {
    const [result] = await pool.query("DELETE FROM board_members WHERE uuid = ?", [req.params.uuid]);
    const affected = (result as { affectedRows: number })?.affectedRows ?? 0;
    if (affected === 0) return res.status(404).json({ detail: "Board member not found" });
    res.status(204).send();
  } catch (err) {
    console.error("Board delete error:", err);
    res.status(500).json({ detail: "Failed to delete board member" });
  }
});

export default router;
