import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import pool from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import imagekit from "../services/imageKitClient.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    const allowed = /^image\/(jpeg|png|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon)$/i.test(file.mimetype) || file.originalname?.toLowerCase().endsWith(".ico");
    if (allowed) cb(null, true);
    else cb(new Error("Only image files (PNG, JPG, SVG, ICO) are allowed"));
  },
});

async function saveLogoFile(filename: string, file: Express.Multer.File): Promise<string> {
  const ext = path.extname(file.originalname) || (file.mimetype?.includes("svg") ? ".svg" : ".png");
  const safe = `${filename}${ext}`;

  const uploadResult = await imagekit.upload({
    file: file.buffer,
    fileName: safe,
    folder: "/imfbxd/logo",
  });

  return uploadResult.url;
}

type SettingsRow = {
  id: number;
  org_name: string | null;
  reg_no: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  address: string | null;
  contact_uae_address: string | null;
  contact_uae_phone: string | null;
  contact_bd_address: string | null;
  contact_bd_phone: string | null;
  footer_email: string | null;
  footer_phone: string | null;
  facebook_url: string | null;
  twitter_url: string | null;
  instagram_url: string | null;
  linkedin_url: string | null;
  primary_logo: string | null;
  favicon: string | null;
  logo_alt_text: string | null;
  show_logo_text: number | null;
  logo_text: string | null;
  updated_at: Date | null;
};

const SELECT_COLS = "id, org_name, reg_no, contact_email, contact_phone, website, address, contact_uae_address, contact_uae_phone, contact_bd_address, contact_bd_phone, footer_email, footer_phone, facebook_url, twitter_url, instagram_url, linkedin_url, primary_logo, favicon, logo_alt_text, show_logo_text, logo_text, updated_at";

function rowToSettings(row: SettingsRow) {
  return {
    org_name: row.org_name ?? "",
    reg_no: row.reg_no ?? "",
    contact_email: row.contact_email ?? "",
    contact_phone: row.contact_phone ?? "",
    website: row.website ?? "",
    address: row.address ?? "",
    contact_uae_address: row.contact_uae_address ?? "",
    contact_uae_phone: row.contact_uae_phone ?? "",
    contact_bd_address: row.contact_bd_address ?? "",
    contact_bd_phone: row.contact_bd_phone ?? "",
    footer_email: row.footer_email ?? "",
    footer_phone: row.footer_phone ?? "",
    facebook_url: row.facebook_url ?? "",
    twitter_url: row.twitter_url ?? "",
    instagram_url: row.instagram_url ?? "",
    linkedin_url: row.linkedin_url ?? "",
    primary_logo: row.primary_logo ?? "",
    favicon: row.favicon ?? "",
    logo_alt_text: row.logo_alt_text ?? "",
    show_logo_text: row.show_logo_text !== 0,
    logo_text: row.logo_text ?? "",
    updated_at: row.updated_at?.toISOString?.() ?? null,
  };
}

const ALLOWED_KEYS = [
  "org_name", "reg_no", "contact_email", "contact_phone", "website", "address",
  "contact_uae_address", "contact_uae_phone", "contact_bd_address", "contact_bd_phone",
  "footer_email", "footer_phone", "facebook_url", "twitter_url", "instagram_url", "linkedin_url",
  "logo_alt_text", "show_logo_text", "logo_text",
] as const;

// GET /api/web/v1/settings/ — public, returns current site settings
router.get("/", async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      `SELECT ${SELECT_COLS} FROM site_settings WHERE id = 1`
    );
    const row = (rows as SettingsRow[])?.[0];
    if (!row) {
      return res.status(404).json({ detail: "Settings not found" });
    }
    res.json(rowToSettings(row));
  } catch (err) {
    console.error("Settings get error:", err);
    res.status(500).json({ detail: "Failed to get settings" });
  }
});

// PATCH /api/web/v1/settings/ — update (admin, requires auth)
router.patch("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const updates: string[] = [];
    const values: unknown[] = [];
    for (const key of ALLOWED_KEYS) {
      if (key in body && body[key] !== undefined) {
        updates.push(`${key} = ?`);
        if (key === "show_logo_text") {
          const v = body[key];
          values.push(v === true || v === "true" || v === "1" ? 1 : 0);
        } else {
          values.push(body[key] != null ? String(body[key]).trim() : null);
        }
      }
    }
    if (updates.length === 0) {
      const [rows] = await pool.query(`SELECT ${SELECT_COLS} FROM site_settings WHERE id = 1`);
      const row = (rows as SettingsRow[])?.[0];
      return res.json(row ? rowToSettings(row) : {});
    }
    const sql = `UPDATE site_settings SET ${updates.join(", ")} WHERE id = 1`;
    await pool.query(sql, values);
    const [rows] = await pool.query(`SELECT ${SELECT_COLS} FROM site_settings WHERE id = 1`);
    const row = (rows as SettingsRow[])?.[0];
    res.json(row ? rowToSettings(row) : {});
  } catch (err) {
    console.error("Settings update error:", err);
    res.status(500).json({ detail: "Failed to update settings" });
  }
});

// POST /api/web/v1/settings/logo — upload logo files + update logo text (multipart, requires auth)
router.post("/logo", requireAuth, upload.fields([{ name: "primary_logo", maxCount: 1 }, { name: "favicon", maxCount: 1 }]), async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const files = req.files as { primary_logo?: Express.Multer.File[]; favicon?: Express.Multer.File[] } | undefined;
    const updates: string[] = [];
    const values: unknown[] = [];

    if (files?.primary_logo?.[0]) {
      const logoPath = await saveLogoFile("primary", files.primary_logo[0]);
      updates.push("primary_logo = ?");
      values.push(logoPath);
    }
    if (files?.favicon?.[0]) {
      const faviconPath = await saveLogoFile("favicon", files.favicon[0]);
      updates.push("favicon = ?");
      values.push(faviconPath);
    }
    if (body.logo_alt_text !== undefined) {
      updates.push("logo_alt_text = ?");
      values.push(body.logo_alt_text != null ? String(body.logo_alt_text).trim() : null);
    }
    if (body.show_logo_text !== undefined) {
      updates.push("show_logo_text = ?");
      values.push(body.show_logo_text === true || body.show_logo_text === "true" || body.show_logo_text === "1" ? 1 : 0);
    }
    if (body.logo_text !== undefined) {
      updates.push("logo_text = ?");
      values.push(body.logo_text != null ? String(body.logo_text).trim() : null);
    }

    if (updates.length > 0) {
      await pool.query(`UPDATE site_settings SET ${updates.join(", ")} WHERE id = 1`, values);
    }
    const [rows] = await pool.query(`SELECT ${SELECT_COLS} FROM site_settings WHERE id = 1`);
    const row = (rows as SettingsRow[])?.[0];
    res.json(row ? rowToSettings(row) : {});
  } catch (err) {
    console.error("Logo update error:", err);
    res.status(500).json({ detail: err instanceof Error ? err.message : "Failed to update logo" });
  }
});

export default router;
