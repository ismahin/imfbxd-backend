import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import pool from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

type RuleRow = {
  id: number;
  uuid: string;
  title: string;
  body: string;
  display_order: number;
  created_at: Date;
  updated_at: Date;
};

function rowToRule(row: RuleRow) {
  return {
    id: row.uuid,
    uuid: row.uuid,
    title: row.title,
    body: row.body,
    display_order: row.display_order,
    created_at: row.created_at?.toISOString?.() ?? undefined,
    updated_at: row.updated_at?.toISOString?.() ?? undefined,
  };
}

router.get("/list/", async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      "SELECT uuid, title, body, display_order, created_at, updated_at FROM rules ORDER BY display_order ASC, created_at ASC"
    );
    res.json({
      count: (rows as RuleRow[]).length,
      results: (rows as RuleRow[]).map(rowToRule),
    });
  } catch (err) {
    console.error("Rules list error:", err);
    res.status(500).json({ detail: "Failed to list rules" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const title = String(body.title ?? "").trim();
    const ruleBody = String(body.body ?? "").trim();
    if (!title) return res.status(400).json({ detail: "Title is required" });
    if (!ruleBody) return res.status(400).json({ detail: "Body is required" });

    const uuid = uuidv4();
    const displayOrderRaw = Number(body.display_order);
    const display_order = Number.isFinite(displayOrderRaw) ? Math.max(0, Math.floor(displayOrderRaw)) : 0;

    await pool.query(
      "INSERT INTO rules (uuid, title, body, display_order) VALUES (?, ?, ?, ?)",
      [uuid, title, ruleBody, display_order]
    );

    const [rows] = await pool.query(
      "SELECT uuid, title, body, display_order, created_at, updated_at FROM rules WHERE uuid = ?",
      [uuid]
    );
    const row = (rows as RuleRow[])?.[0];
    res.status(201).json(row ? rowToRule(row) : { uuid, title, body: ruleBody, display_order });
  } catch (err) {
    console.error("Rules create error:", err);
    res.status(500).json({ detail: "Failed to create rule" });
  }
});

router.delete("/:uuid/", requireAuth, async (req: Request, res: Response) => {
  try {
    const [result] = await pool.query("DELETE FROM rules WHERE uuid = ?", [req.params.uuid]);
    const affected = (result as { affectedRows: number })?.affectedRows ?? 0;
    if (affected === 0) return res.status(404).json({ detail: "Rule not found" });
    res.status(204).send();
  } catch (err) {
    console.error("Rules delete error:", err);
    res.status(500).json({ detail: "Failed to delete rule" });
  }
});

export default router;
