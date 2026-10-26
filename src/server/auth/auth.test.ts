import { describe, expect, it } from "vitest";
import { hashPassword, passwordSchema, verifyPassword } from "./password";
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
});

describe("email", () => {
  it("normalises for the unique index / welcome-bonus guard (FR-1.2)", () => {
    expect(normalizeEmail("  Sara@Example.COM ")).toBe("sara@example.com");
    expect(emailSchema.parse("  Sara@Example.COM ")).toBe("sara@example.com");
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });
});
