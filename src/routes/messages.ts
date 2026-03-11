import { Router, Request, Response } from "express";
import pool from "../db/pool.js";
import { v4 as uuidv4 } from "uuid";

const router = Router();

type MessageRow = {
  id: number;
  uuid: string;
  name: string;
  email: string;
  website: string | null;
  message: string;
  created_at: Date;
};

function rowToMessage(row: MessageRow) {
  return {
    id: row.uuid,
    uuid: row.uuid,
    name: row.name,
    email: row.email,
    website: row.website ?? undefined,
    message: row.message,
    created_at: row.created_at?.toISOString?.() ?? undefined,
  };
}

// POST /api/web/v1/messages/ — submit from public contact form (no auth required)
router.post("/", async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();
    const message = String(body.message ?? "").trim();
    if (!name || !email || !message) {
      return res.status(400).json({ detail: "Name, email, and message are required" });
    }
    const website = body.website != null ? String(body.website).trim() : null;
    const uuid = uuidv4();
    await pool.query(
      "INSERT INTO messages (uuid, name, email, website, message) VALUES (?, ?, ?, ?, ?)",
      [uuid, name, email, website || null, message]
    );
    const [rows] = await pool.query(
      "SELECT uuid, name, email, website, message, created_at FROM messages WHERE uuid = ?",
      [uuid]
    );
    const row = (rows as MessageRow[])?.[0];
    res.status(201).json(row ? rowToMessage(row) : { id: uuid, uuid, name, email, website: website ?? undefined, message, created_at: new Date().toISOString() });
  } catch (err) {
    console.error("Message submit error:", err);
    res.status(500).json({ detail: "Failed to submit message" });
  }
});

// GET /api/web/v1/messages/list/ — list for admin (optional limit, offset)
router.get("/list/", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    const [countResult] = await pool.query("SELECT COUNT(*) AS total FROM messages");
    const total = Number((countResult as { total: number }[])?.[0]?.total ?? 0);
    const [rows] = await pool.query(
      "SELECT uuid, name, email, website, message, created_at FROM messages ORDER BY created_at DESC LIMIT ? OFFSET ?",
      [limit, offset]
    );
    const results = ((rows as MessageRow[]) || []).map(rowToMessage);
    res.json({
      count: total,
      next: offset + results.length < total ? `?limit=${limit}&offset=${offset + limit}` : null,
      previous: offset > 0 ? `?limit=${limit}&offset=${Math.max(0, offset - limit)}` : null,
      results,
    });
  } catch (err) {
    console.error("Messages list error:", err);
    res.status(500).json({ detail: "Failed to list messages" });
  }
});

export default router;
