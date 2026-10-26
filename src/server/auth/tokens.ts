import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

// Opaque random tokens (login cookies, FR-1.1 verification links).
// Only the SHA-256 hex digest is stored in the database.

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("البريد الإلكتروني غير صالح").max(254));

/** Canonical form stored in users.email (DB CHECK enforces lower(btrim(email))). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
