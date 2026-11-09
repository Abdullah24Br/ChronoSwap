import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

// "server-only" throws outside Next.js; the service is server code by design, so the test may load it.
vi.mock("server-only", () => ({}));
import { db } from "@/server/db";
import { loginUser, registerUser } from "@/server/services/auth/auth-service";

afterAll(() => db.$disconnect());

// FR-1.1 / Q-2: a new account is unusable until its e-mail link is used; no welcome bonus before that.
describe("E-mail activation (FR-1.1, FR-1.2)", () => {
  it("creates an unverified account with a pending link and no welcome bonus", async () => {
    const email = `verify-${randomUUID()}@chronoswap.test`;
    const res = await registerUser({ displayName: "مستخدم جديد", email, password: "Strong#Pass1" });

    expect(res.needsVerification).toBe(true);
    const user = await db.user.findUniqueOrThrow({
      where: { email },
      include: { wallet: true, verificationTokens: true },
    });
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.role).toBe("USER");
    expect(user.verificationTokens).toHaveLength(1);
    expect(user.verificationTokens[0].usedAt).toBeNull();
    expect(user.wallet?.availableMinutes ?? 0).toBe(0);
    expect(await db.ledgerEntry.count({ where: { walletId: user.wallet!.id } })).toBe(0);
  });

  it("refuses to log in until the link has been used", async () => {
    const email = `locked-${randomUUID()}@chronoswap.test`;
    await registerUser({ displayName: "مقفل", email, password: "Strong#Pass1" });

    await expect(loginUser({ email, password: "Strong#Pass1" })).rejects.toMatchObject({
      code: "EMAIL_NOT_VERIFIED",
    });
  });
});
