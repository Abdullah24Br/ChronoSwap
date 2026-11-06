import { describe, expect, it } from "vitest";
import { EMAIL_VERIFICATION_TTL_HOURS, EMAIL_VERIFICATION_TTL_MS } from "@/lib/rules";
import { hashPassword, passwordSchema, verifyPassword } from "./password";
import { loginSchema, registerSchema } from "./schemas";
import { emailSchema, generateToken, hashToken, normalizeEmail } from "./tokens";

describe("password (NFR-1)", () => {
  it("hashes with bcrypt and verifies", async () => {
    const hash = await hashPassword("كلمة-سر-قوية");
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyPassword("كلمة-سر-قوية", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("rejects passwords bcrypt would silently truncate", () => {
    expect(passwordSchema.safeParse("ب".repeat(36)).success).toBe(true); // 72 bytes
    expect(passwordSchema.safeParse("ب".repeat(37)).success).toBe(false); // 74 bytes
    expect(passwordSchema.safeParse("short").success).toBe(false);
  });
});

describe("tokens", () => {
  it("generates unguessable url-safe tokens and stores only a hash", () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateToken()).not.toBe(a);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).toBe(hashToken(a));
  });

  it("FR-1.1: verification token validity is 24 hours", () => {
    expect(EMAIL_VERIFICATION_TTL_HOURS).toBe(24);
    expect(EMAIL_VERIFICATION_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("email", () => {
  it("normalises for the unique index / welcome-bonus guard (FR-1.2)", () => {
    expect(normalizeEmail("  Sara@Example.COM ")).toBe("sara@example.com");
    expect(emailSchema.parse("  Sara@Example.COM ")).toBe("sara@example.com");
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });
});

describe("auth schemas (FR-1.1)", () => {
  it("validates registration input correctly", () => {
    const valid = registerSchema.safeParse({
      displayName: "عبدالله البريدي",
      email: "abdullah@example.com",
      password: "StrongPassword123",
    });
    expect(valid.success).toBe(true);

    // Reject short display name (< 2 chars)
    const shortName = registerSchema.safeParse({
      displayName: "أ",
      email: "abdullah@example.com",
      password: "StrongPassword123",
    });
    expect(shortName.success).toBe(false);

    // Reject password < 8 chars
    const shortPass = registerSchema.safeParse({
      displayName: "عبدالله",
      email: "abdullah@example.com",
      password: "1234567",
    });
    expect(shortPass.success).toBe(false);

    // Reject invalid email
    const badEmail = registerSchema.safeParse({
      displayName: "عبدالله",
      email: "notanemail",
      password: "StrongPassword123",
    });
    expect(badEmail.success).toBe(false);
  });

  it("validates login input correctly", () => {
    const valid = loginSchema.safeParse({
      email: "test@example.com",
      password: "secretpassword",
    });
    expect(valid.success).toBe(true);

    const emptyPass = loginSchema.safeParse({
      email: "test@example.com",
      password: "",
    });
    expect(emptyPass.success).toBe(false);
  });
});
