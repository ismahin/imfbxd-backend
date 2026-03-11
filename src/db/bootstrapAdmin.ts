import pool from "./pool.js";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

/**
 * If no Admin user exists and ADMIN_EMAIL + ADMIN_PASSWORD are set in env,
 * create an initial admin user. Safe to run on every startup.
 */
export async function ensureInitialAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "Admin";

  if (!email || !password) {
    return;
  }

  if (password.length < 8) {
    console.warn("Bootstrap admin skipped: ADMIN_PASSWORD must be at least 8 characters.");
    return;
  }

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query<{ n: number }[]>(
      "SELECT COUNT(*) AS n FROM members WHERE user_type = 'Admin' LIMIT 1"
    );
    const hasAdmin = Number(rows?.[0]?.n ?? 0) > 0;
    if (hasAdmin) {
      return;
    }

    const [maxRows] = await conn.query<{ max_id: number }[]>(
      "SELECT COALESCE(MAX(CAST(SUBSTRING(user_id, 4) AS UNSIGNED)), 0) AS max_id FROM members WHERE user_id REGEXP '^IMF[0-9]+$'"
    );
    const maxId = Number(maxRows?.[0]?.max_id ?? 0);
    const user_id = `IMF${String(maxId + 1).padStart(5, "0")}`;
    const uuid = uuidv4();
    const password_hash = await bcrypt.hash(password, 10);

    await conn.query(
      `INSERT INTO members (uuid, user_id, email, password_hash, name, user_type)
       VALUES (?, ?, ?, ?, ?, 'Admin')`,
      [uuid, user_id, email, password_hash, name]
    );
    console.log(`Initial admin created: ${email}`);
  } catch (err) {
    console.error("Bootstrap admin error:", err);
    throw err;
  } finally {
    conn.release();
  }
}
