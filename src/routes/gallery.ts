import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import pool from "../db/pool.js";
import { v4 as uuidv4 } from "uuid";
import imagekit from "../services/imageKitClient.js";
import { requireAuth } from "../middleware/auth.js";

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

async function saveGalleryImage(uuid: string, file: Express.Multer.File): Promise<string> {
  const ext = path.extname(file.originalname) || ".jpg";
  const safeExt = /^\.(jpe?g|png|gif|webp)$/i.test(ext) ? ext : ".jpg";
  const filename = `${uuid}${safeExt}`;

  const uploadResult = await imagekit.upload({
    file: file.buffer,
    fileName: filename,
    folder: "/imfbxd/gallery",
  });

  return uploadResult.url;
}

function maybeMulter(req: Request, res: Response, next: (err?: unknown) => void) {
  const contentType = req.headers["content-type"] || "";
  if (contentType.startsWith("multipart/form-data")) {
    return upload.single("image")(req, res, (err?: unknown) => {
      if (err) {
        console.error("Gallery multer error:", err);
        return res.status(400).json({ detail: err instanceof Error ? err.message : "File upload failed" });
      }
      next();
    });
  }
  next();
}

type GalleryRow = {
  id: number;
  uuid: string;
  title: string;
  category: string;
  date: string | null;
  image_path: string;
  alt: string | null;
  created_at: Date;
};

const SECTION_OPTIONS = ["Hero", "Objectives", "Gallery"] as const;
type GallerySection = (typeof SECTION_OPTIONS)[number];

const SECTION_ALIASES: Record<string, GallerySection> = {
  hero: "Hero",
  objectives: "Objectives",
  objective: "Objectives",
  aims: "Objectives",
  "aims & objectives": "Objectives",
  "aims and objectives": "Objectives",
  gallery: "Gallery",
  event: "Gallery",
  events: "Gallery",
  meeting: "Gallery",
  meetings: "Gallery",
  award: "Gallery",
  awards: "Gallery",
  office: "Gallery",
  community: "Gallery",
};

function resolveSection(value: unknown): GallerySection | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw || raw === "all") return null;
  return SECTION_ALIASES[raw] ?? null;
}

function normalizeSection(value: unknown, fallback: GallerySection = "Gallery"): GallerySection {
  return resolveSection(value) ?? fallback;
}

function rowToItem(row: GalleryRow) {
  const category = normalizeSection(row.category);

  return {
    id: row.uuid,
    uuid: row.uuid,
    title: row.title,
    category,
    date: row.date ?? undefined,
    url: row.image_path,
    alt: row.alt ?? row.title,
    created_at: row.created_at?.toISOString?.() ?? undefined,
  };
}

// GET /api/web/v1/gallery/list/ — list all (optional category, limit, offset)
router.get("/list/", async (req: Request, res: Response) => {
  try {
    const categoryParam = req.query.category as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;

    let where = "";
    const params: unknown[] = [];
    const category = resolveSection(categoryParam);
    if (categoryParam && String(categoryParam).trim() && String(categoryParam).trim().toLowerCase() !== "all" && !category) {
      return res.status(400).json({ detail: `Invalid gallery section. Allowed values: ${SECTION_OPTIONS.join(", ")}` });
    }
    if (category) {
      where = " WHERE category = ?";
      params.push(category);
    }

    const [countResult] = await pool.query(
      `SELECT COUNT(*) AS total FROM gallery${where}`,
      params
    );
    const total = Number((countResult as { total: number }[])?.[0]?.total ?? 0);

    const [rows] = await pool.query(
      `SELECT uuid, title, category, date, image_path, alt, created_at FROM gallery${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const results = ((rows as GalleryRow[]) || []).map(rowToItem);

    res.json({
      count: total,
      next: offset + results.length < total ? `?limit=${limit}&offset=${offset + limit}` : null,
      previous: offset > 0 ? `?limit=${limit}&offset=${Math.max(0, offset - limit)}` : null,
      results,
    });
  } catch (err) {
    console.error("Gallery list error:", err);
    res.status(500).json({ detail: "Failed to list gallery" });
  }
});

// GET /api/web/v1/gallery/:uuid/
router.get("/:uuid/", async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      "SELECT uuid, title, category, date, image_path, alt, created_at FROM gallery WHERE uuid = ?",
      [req.params.uuid]
    );
    const row = (rows as GalleryRow[])?.[0];
    if (!row) return res.status(404).json({ detail: "Gallery item not found" });
    res.json(rowToItem(row));
  } catch (err) {
    console.error("Gallery get error:", err);
    res.status(500).json({ detail: "Failed to get gallery item" });
  }
});

// POST /api/web/v1/gallery/ — create (multipart: image + title, category?, date?, alt?)
router.post("/", requireAuth, maybeMulter, async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const title = String(body.title ?? "").trim();
    if (!title) return res.status(400).json({ detail: "Title is required" });

    const file = req.file;
    if (!file) return res.status(400).json({ detail: "Image file is required" });

    const uuid = uuidv4();
    const image_path = await saveGalleryImage(uuid, file);
    const categoryInput = body.section ?? body.category;
    const category = categoryInput === undefined ? "Gallery" : resolveSection(categoryInput);
    if (!category) {
      return res.status(400).json({ detail: `Invalid gallery section. Allowed values: ${SECTION_OPTIONS.join(", ")}` });
    }
    const date = body.date != null && String(body.date).trim() ? String(body.date).trim() : null;
    const alt = body.alt != null ? String(body.alt).trim() : null;

    await pool.query(
      "INSERT INTO gallery (uuid, title, category, date, image_path, alt) VALUES (?, ?, ?, ?, ?, ?)",
      [uuid, title, category, date, image_path, alt]
    );

    const [rows] = await pool.query(
      "SELECT uuid, title, category, date, image_path, alt, created_at FROM gallery WHERE uuid = ?",
      [uuid]
    );
    const row = (rows as GalleryRow[])?.[0];
    res.status(201).json(row ? rowToItem(row) : { uuid, title, category, date, url: image_path, alt });
  } catch (err) {
    console.error("Gallery create error:", err);
    res.status(500).json({ detail: "Failed to create gallery item" });
  }
});

// PATCH /api/web/v1/gallery/:uuid/ — update metadata and/or replace image
router.patch("/:uuid/", requireAuth, maybeMulter, async (req: Request, res: Response) => {
  try {
    const uuid = req.params.uuid;
    const body = req.body as Record<string, unknown>;
    const file = req.file;

    const [existing] = await pool.query(
      "SELECT uuid, title, category, date, image_path, alt FROM gallery WHERE uuid = ?",
      [uuid]
    );
    const row = (existing as GalleryRow[])?.[0];
    if (!row) return res.status(404).json({ detail: "Gallery item not found" });

    let image_path = row.image_path;
    if (file) {
      image_path = await saveGalleryImage(uuid, file);
    }

    const title = body.title != null ? String(body.title).trim() : row.title;
    const currentCategory = normalizeSection(row.category);
    const categoryInput = body.section ?? body.category;
    const category = categoryInput !== undefined ? resolveSection(categoryInput) : currentCategory;
    if (!category) {
      return res.status(400).json({ detail: `Invalid gallery section. Allowed values: ${SECTION_OPTIONS.join(", ")}` });
    }
    const date = body.date !== undefined ? (body.date != null && String(body.date).trim() ? String(body.date).trim() : null) : row.date;
    const alt = body.alt !== undefined ? (body.alt != null ? String(body.alt).trim() : null) : row.alt;

    await pool.query(
      "UPDATE gallery SET title = ?, category = ?, date = ?, image_path = ?, alt = ? WHERE uuid = ?",
      [title, category, date, image_path, alt, uuid]
    );

    const [rows] = await pool.query(
      "SELECT uuid, title, category, date, image_path, alt, created_at FROM gallery WHERE uuid = ?",
      [uuid]
    );
    const updated = (rows as GalleryRow[])?.[0];
    res.json(updated ? rowToItem(updated) : { uuid, title, category, date, url: image_path, alt });
  } catch (err) {
    console.error("Gallery update error:", err);
    res.status(500).json({ detail: "Failed to update gallery item" });
  }
});

// DELETE /api/web/v1/gallery/:uuid/
router.delete("/:uuid/", requireAuth, async (req: Request, res: Response) => {
  try {
    const [result] = await pool.query("DELETE FROM gallery WHERE uuid = ?", [req.params.uuid]);
    const affected = (result as { affectedRows: number })?.affectedRows ?? 0;
    if (affected === 0) return res.status(404).json({ detail: "Gallery item not found" });
    res.status(204).send();
  } catch (err) {
    console.error("Gallery delete error:", err);
    res.status(500).json({ detail: "Failed to delete gallery item" });
  }
});

export default router;
