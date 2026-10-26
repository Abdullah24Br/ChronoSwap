import bcrypt from "bcryptjs";
import { z } from "zod";

// NFR-1: passwords are stored only as bcrypt hashes.
const BCRYPT_COST = 12;
/** bcrypt silently ignores bytes after 72; reject instead of truncating. */
const BCRYPT_MAX_BYTES = 72;

export const passwordSchema = z
  .string()
  .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
  .refine((p) => new TextEncoder().encode(p).length <= BCRYPT_MAX_BYTES, "كلمة المرور طويلة جداً");

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
