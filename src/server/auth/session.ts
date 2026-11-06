import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { db } from "@/server/db";
import { generateToken, hashToken } from "./tokens";

// DB-backed login sessions (FR-1.1, NFR-1). The cookie holds a random token;
// the DB holds only its hash. With cacheComponents enabled, call these only
// inside a <Suspense> boundary or from server actions / route handlers.

const COOKIE_NAME = "cs_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  role: "USER" | "ADMIN";
  timezone: string;
  emailVerified: boolean;
}

export async function createAuthSession(userId: string, userAgent?: string): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.authSession.create({
    data: { userId, tokenHash: hashToken(token), expiresAt, userAgent: userAgent?.slice(0, 400) },
  });
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  await connection();
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await db.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date()) return null;
  const { user } = session;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    timezone: user.timezone,
    emailVerified: user.emailVerifiedAt !== null,
  };
}

export async function destroyAuthSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) await db.authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(COOKIE_NAME);
}
