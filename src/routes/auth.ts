import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import pool from "../db/pool.js";
import bcrypt from "bcryptjs";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "imf-dev-secret-change-in-production";
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || "7d") as jwt.SignOptions["expiresIn"];

type MemberRow = {
  uuid: string;
  user_id: string;
  email: string;
  name: string;
  user_type: string;
  is_active: number;
  [key: string]: unknown;
};

// POST /api/web/v1/authentication/login/
router.post("/login/", async (req: Request, res: Response) => {
  try {
    const { email, password } = (req.body || {}) as { email?: string; password?: string };
    const emailTrim = typeof email === "string" ? email.trim() : "";
    const passwordStr = typeof password === "string" ? password : "";

    if (!emailTrim || !passwordStr) {
      return res.status(400).json({ detail: "Email and password are required" });
    }

    const [rows] = await pool.query<(MemberRow & { password_hash: string })[]>(
      "SELECT uuid, user_id, email, password_hash, name, phone, user_type, is_active FROM members WHERE email = ? LIMIT 1",
      [emailTrim]
    );
    const member = Array.isArray(rows) ? rows[0] : null;
    if (!member) {
      return res.status(401).json({ detail: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(passwordStr, member.password_hash || "");
    if (!valid) {
      return res.status(401).json({ detail: "Invalid email or password" });
    }

    if (member.is_active === 0) {
      return res.status(403).json({ detail: "Account is deactivated" });
    }

    const options: jwt.SignOptions = { expiresIn: JWT_EXPIRES_IN };
    const token = jwt.sign(
      { sub: member.uuid, email: member.email, user_type: member.user_type },
      JWT_SECRET,
      options
    );
    // Frontend accepts both access/refresh and access_token/refresh_token
    res.json({ access_token: token, refresh_token: token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ detail: "Login failed" });
  }
});

export default router;
