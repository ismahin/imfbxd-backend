import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "imf-dev-secret-change-in-production";

export type JwtPayload = { sub: string; email?: string; user_type?: string };

/**
 * Optional auth: in production, require Authorization Bearer token.
 * In development, allow requests without token so skip-auth frontend works.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    (req as Request & { token?: string }).token = auth.slice(7);
  }
  if (process.env.NODE_ENV === "production" && !(req as Request & { token?: string }).token) {
    return res.status(401).json({ detail: "Authentication required" });
  }
  next();
}

/**
 * If Bearer token is present, decode and set req.user. Never returns 401.
 * Use before routes that need to know "who is this?" for authorization.
 */
export function optionalDecode(req: Request, res: Response, next: NextFunction) {
  const token = (req as Request & { token?: string }).token || req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    (req as Request & { user?: JwtPayload }).user = payload;
  } catch {
    // invalid token – leave req.user unset
  }
  next();
}

/**
 * Decode JWT and attach payload to req. Returns 401 if token missing or invalid.
 * In production: 401 when token missing or invalid.
 * In development: 401 only when token is present but invalid; missing token is allowed (for skip-auth flow).
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = (req as Request & { token?: string }).token || req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    if (process.env.NODE_ENV === "production") {
      return res.status(401).json({ detail: "Authentication required" });
    }
    return next();
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    (req as Request & { user?: JwtPayload }).user = payload;
    next();
  } catch {
    return res.status(401).json({ detail: "Invalid or expired token" });
  }
}
