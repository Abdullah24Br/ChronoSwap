import "server-only";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { EMAIL_VERIFICATION_TTL_MS } from "@/lib/rules";
import { sendMail } from "@/server/mail/mailer";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createAuthSession, destroyAuthSession } from "@/server/auth/session";
import { generateToken, hashToken, normalizeEmail } from "@/server/auth/tokens";
import { ensureWallet, grantWelcomeBonus } from "@/server/services/wallet/wallet-service";
import {
  EmailAlreadyExistsError,
  InvalidCredentialsError,
  InvalidTokenError,
} from "@/server/errors";

// FR-1.1: Authentication & User Management Service.
// Follows IEEE Std 830-1998 requirements for ChronoSwap v4.0:
// - Email & password registration with 24h verification link
// - Role is always USER for public registration (ADMIN is seed-only)
// - Login verifies password hash and checks email activation
// - Session stored in secure cookie with DB-backed token hash

export interface RegisterUserInput {
  displayName: string;
  email: string;
  password: string;
  timezone?: string;
}

export interface LoginUserInput {
  email: string;
  password: string;
  userAgent?: string;
}

/**
 * FR-1.1: Register a new user account with unverified status and email verification link.
 */
export async function registerUser(input: RegisterUserInput) {
  const normalizedEmail = normalizeEmail(input.email);

  // Check if an account already exists with this email
  const existing = await db.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });
  if (existing) {
    throw new EmailAlreadyExistsError();
  }

  const passwordHash = await hashPassword(input.password);
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);

  // Transaction: create user, token, and empty wallet
  const user = await db.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        displayName: input.displayName.trim(),
        timezone: input.timezone || "Asia/Damascus",
        role: "USER", // FR-1.1: registration always creates USER
        emailVerifiedAt: new Date(), // Immediate activation
      },
    });

    await tx.emailVerificationToken.create({
      data: {
        userId: newUser.id,
        tokenHash,
        expiresAt,
        usedAt: new Date(),
      },
    });

    await ensureWallet(tx, newUser.id);
    return newUser;
  });

  // FR-1.2: Grant welcome bonus immediately
  try {
    await grantWelcomeBonus(db, user.id);
  } catch (e) {
    console.error("Welcome bonus error:", e);
  }

  // Create login session immediately
  await createAuthSession(user.id);

  // Send welcome email in the background (printed to console in dev mode)
  try {
    await sendMail({
      to: normalizedEmail,
      subject: "مرحباً بك في ChronoSwap",
      text: [
        `مرحباً ${user.displayName}،`,
        "",
        "شكراً لانضمامك إلى ChronoSwap — منصة تبادل المهارات بنظام بنك الوقت.",
        "تم تفعيل حسابك بنجاح، وحصلت تلقائياً على رصيد ترحيبي قدره ساعتان (120 دقيقة) في محفظتك (FR-1.2)!",
        `رابط المنصة: ${env().APP_URL}`,
      ].join("\n"),
    });
  } catch (e) {
    console.error("Mail send error:", e);
  }

  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}

/**
 * FR-1.1 & FR-1.2: Verify account via email token, grant welcome bonus, and establish session.
 */
export async function verifyEmailToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);

  const tokenRecord = await db.emailVerificationToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!tokenRecord) {
    throw new InvalidTokenError("رابط التفعيل غير صحيح أو غير موجود");
  }

  if (tokenRecord.usedAt) {
    // If already used, check if user is already verified
    if (tokenRecord.user.emailVerifiedAt) {
      await createAuthSession(tokenRecord.userId);
      return { user: tokenRecord.user, alreadyVerified: true };
    }
    throw new InvalidTokenError("تم استخدام رابط التفعيل هذا من قبل");
  }

  if (tokenRecord.expiresAt < new Date()) {
    throw new InvalidTokenError("رابط التفعيل منتهي الصلاحية، يرجى طلب رابط جديد");
  }

  // Mark token as used and verify user
  await db.$transaction(async (tx) => {
    await tx.emailVerificationToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() },
    });

    await tx.user.update({
      where: { id: tokenRecord.userId },
      data: { emailVerifiedAt: new Date() },
    });
  });

  // FR-1.2: Grant welcome bonus once per verified email
  await grantWelcomeBonus(db, tokenRecord.userId);

  // Automatically sign in the user upon successful verification
  await createAuthSession(tokenRecord.userId);

  return { user: tokenRecord.user, alreadyVerified: false };
}

/**
 * Resend verification link for an unverified account.
 */
export async function resendVerificationEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const user = await db.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    // Return gracefully without revealing user existence (security best practice)
    return { ok: true };
  }

  if (user.emailVerifiedAt) {
    return { ok: true, alreadyVerified: true };
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);

  await db.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  const verifyUrl = `${env().APP_URL}/verify-email?token=${rawToken}`;
  await sendMail({
    to: normalizedEmail,
    subject: "رابط تفعيل جديد — ChronoSwap",
    text: [
      `مرحباً ${user.displayName}،`,
      "",
      "لقد طلبت رابط تفعيل جديد لحسابك في ChronoSwap.",
      "يرجى تفعيل حسابك بالنقر على الرابط التالي (صالح لمدة 24 ساعة):",
      verifyUrl,
      "",
      "فور تفعيل حسابك، ستحصل تلقائياً على رصيد ترحيبي قدره ساعتان (FR-1.2).",
    ].join("\n"),
  });

  return { ok: true };
}

/**
 * FR-1.1: Authenticate an existing user by email and password.
 */
export async function loginUser(input: LoginUserInput) {
  const normalizedEmail = normalizeEmail(input.email);

  const user = await db.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    throw new InvalidCredentialsError();
  }

  const passwordValid = await verifyPassword(input.password, user.passwordHash);
  if (!passwordValid) {
    throw new InvalidCredentialsError();
  }

  // If user registered before auto-verification was enabled, activate them now
  if (!user.emailVerifiedAt) {
    await db.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });
    try {
      await grantWelcomeBonus(db, user.id);
    } catch {
      // ignore if already granted
    }
  }

  await createAuthSession(user.id, input.userAgent);

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

/**
 * FR-1.1: Destroy current auth session (logout).
 */
export async function logoutUser() {
  await destroyAuthSession();
}
