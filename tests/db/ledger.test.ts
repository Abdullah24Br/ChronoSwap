import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { InsufficientBalanceError } from "@/server/errors";
import { postLedgerEntries, withWalletTransaction } from "@/server/services/wallet/ledger";
import { grantWelcomeBonus } from "@/server/services/wallet/wallet-service";

afterAll(() => db.$disconnect());

async function makeUser(opts: { verified?: boolean; email?: string } = {}) {
  return db.user.create({
    data: {
      email: opts.email ?? `u-${randomUUID()}@chronoswap.test`,
      passwordHash: "x",
      displayName: "مستخدم تجريبي",
      emailVerifiedAt: opts.verified === false ? null : new Date(),
      wallet: { create: {} },
    },
  });
}

async function wallet(userId: string) {
  return db.wallet.findUniqueOrThrow({ where: { userId } });
}

describe("welcome bonus (FR-1.2)", () => {
  it("grants 120 minutes once, through the ledger", async () => {
    const u = await makeUser();
    expect(await grantWelcomeBonus(db, u.id)).toBe(true);
    expect(await grantWelcomeBonus(db, u.id)).toBe(false);

    const w = await wallet(u.id);
    expect(w.availableMinutes).toBe(120);
    expect(w.version).toBe(1);
    const entries = await db.ledgerEntry.findMany({ where: { walletId: w.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: "WELCOME_BONUS", availableDelta: 120, availableAfter: 120 });
  });

  it("is refused for unverified e-mails", async () => {
    const u = await makeUser({ verified: false });
    await expect(grantWelcomeBonus(db, u.id)).rejects.toThrow(/verified/);
  });

  it("concurrent grants still give exactly one bonus", async () => {
    const u = await makeUser();
    const results = await Promise.all([1, 2, 3, 4].map(() => grantWelcomeBonus(db, u.id)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await wallet(u.id)).availableMinutes).toBe(120);
  });
});

describe("postLedgerEntries (NFR-2)", () => {
  it("moves minutes atomically between wallets (freeze then release)", async () => {
    const learner = await makeUser();
    const teacher = await makeUser();
    await grantWelcomeBonus(db, learner.id);

    await withWalletTransaction(db, (tx) =>
      postLedgerEntries(tx, [{ userId: learner.id, type: "SESSION_FREEZE", delta: { available: -90, frozen: 90 } }]),
    );
    await withWalletTransaction(db, (tx) =>
      postLedgerEntries(tx, [
        { userId: learner.id, type: "SESSION_RELEASE_DEBIT", delta: { frozen: -90 }, idempotencyKey: `t1:${learner.id}:d` },
        { userId: teacher.id, type: "SESSION_RELEASE_CREDIT", delta: { available: 90 }, idempotencyKey: `t1:${learner.id}:c` },
      ]),
    );

    expect(await wallet(learner.id)).toMatchObject({ availableMinutes: 30, frozenMinutes: 0, version: 3 });
    expect(await wallet(teacher.id)).toMatchObject({ availableMinutes: 90, version: 1 });
  });

  it("is idempotent: replaying the same keys changes nothing", async () => {
    const teacher = await makeUser();
    const post = () =>
      withWalletTransaction(db, (tx) =>
        postLedgerEntries(tx, [
          { userId: teacher.id, type: "ADMIN_ADJUSTMENT", delta: { available: 30 }, idempotencyKey: `replay:${teacher.id}` },
        ]),
      );
    expect((await post()).applied).toBe(true);
    expect((await post()).applied).toBe(false);
    expect((await wallet(teacher.id)).availableMinutes).toBe(30);
  });

  it("rejects overdrafts and rolls back the whole operation", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await grantWelcomeBonus(db, a.id);
    await expect(
      withWalletTransaction(db, (tx) =>
        postLedgerEntries(tx, [
          { userId: b.id, type: "ADMIN_ADJUSTMENT", delta: { available: 500 } },
          { userId: a.id, type: "SESSION_FREEZE", delta: { available: -500, frozen: 500 } },
        ]),
      ),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);
    expect((await wallet(a.id)).availableMinutes).toBe(120);
    expect((await wallet(b.id)).availableMinutes).toBe(0);
  });

  it("serialises concurrent spending with row locks (no lost updates)", async () => {
    const u = await makeUser();
    await grantWelcomeBonus(db, u.id); // 120 minutes
    const spend = () =>
      withWalletTransaction(db, (tx) =>
        postLedgerEntries(tx, [{ userId: u.id, type: "SESSION_FREEZE", delta: { available: -30, frozen: 30 } }]),
      );
    const results = await Promise.allSettled(Array.from({ length: 6 }, spend));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
    expect(await wallet(u.id)).toMatchObject({ availableMinutes: 0, frozenMinutes: 120, version: 5 });
  });

  it("rejects float minutes", async () => {
    const u = await makeUser();
    await expect(
      withWalletTransaction(db, (tx) =>
        postLedgerEntries(tx, [{ userId: u.id, type: "ADMIN_ADJUSTMENT", delta: { available: 0.5 } }]),
      ),
    ).rejects.toThrow(TypeError);
  });
});

describe("database guarantees", () => {
  it("ledger is append-only (UPDATE / DELETE / TRUNCATE blocked by trigger)", async () => {
    const u = await makeUser();
    await grantWelcomeBonus(db, u.id);
    const entry = await db.ledgerEntry.findFirstOrThrow({ where: { wallet: { userId: u.id } } });
    await expect(db.ledgerEntry.update({ where: { id: entry.id }, data: { memo: "edit" } })).rejects.toThrow(/append-only/);
    await expect(db.ledgerEntry.delete({ where: { id: entry.id } })).rejects.toThrow(/append-only/);
    await expect(db.$executeRawUnsafe("TRUNCATE ledger_entries CASCADE")).rejects.toThrow(/append-only/);
  });

  it("wallet balances cannot go negative even with raw SQL", async () => {
    const u = await makeUser();
    await expect(
      db.$executeRaw`UPDATE wallets SET available_minutes = -1 WHERE user_id = ${u.id}::uuid`,
    ).rejects.toThrow(/wallets_available_non_negative/);
  });

  it("e-mails must be stored normalised", async () => {
    await expect(makeUser({ email: "Mixed@Case.test" })).rejects.toThrow(/users_email_normalised/);
  });

  it("a teacher cannot have two overlapping accepted sessions", async () => {
    const teacher = await makeUser();
    const l1 = await makeUser();
    const l2 = await makeUser();
    const category = await db.skillCategory.create({ data: { slug: `c-${randomUUID()}`, nameAr: `فئة ${randomUUID()}` } });
    const skill = await db.skill.create({ data: { slug: `s-${randomUUID()}`, nameAr: "مهارة", categoryId: category.id } });
    const base = {
      teacherId: teacher.id,
      skillId: skill.id,
      durationMinutes: 60,
      escrowMinutes: 60,
      goal: "هدف",
      status: "ACCEPTED" as const,
    };
    await db.session.create({
      data: { ...base, learnerId: l1.id, startAt: new Date("2030-01-01T10:00:00Z"), endAt: new Date("2030-01-01T11:00:00Z") },
    });
    await expect(
      db.session.create({
        data: { ...base, learnerId: l2.id, startAt: new Date("2030-01-01T10:30:00Z"), endAt: new Date("2030-01-01T11:30:00Z") },
      }),
    ).rejects.toThrow(/sessions_teacher_no_overlap/);
    // Back-to-back is fine ([) ranges), and PENDING requests may overlap.
    await db.session.create({
      data: { ...base, learnerId: l2.id, startAt: new Date("2030-01-01T11:00:00Z"), endAt: new Date("2030-01-01T12:00:00Z") },
    });
    await db.session.create({
      data: { ...base, status: "PENDING", learnerId: l2.id, startAt: new Date("2030-01-01T10:30:00Z"), endAt: new Date("2030-01-01T11:30:00Z") },
    });
  });

  it("session duration and end time are enforced (FR-4.1)", async () => {
    const teacher = await makeUser();
    const learner = await makeUser();
    const category = await db.skillCategory.create({ data: { slug: `c-${randomUUID()}`, nameAr: `فئة ${randomUUID()}` } });
    const skill = await db.skill.create({ data: { slug: `s-${randomUUID()}`, nameAr: "مهارة", categoryId: category.id } });
    await expect(
      db.session.create({
        data: {
          teacherId: teacher.id, learnerId: learner.id, skillId: skill.id, goal: "x",
          durationMinutes: 45, escrowMinutes: 45,
          startAt: new Date("2030-02-01T10:00:00Z"), endAt: new Date("2030-02-01T10:45:00Z"),
        },
      }),
    ).rejects.toThrow(/sessions_duration_allowed/);
    await expect(
      db.session.create({
        data: {
          teacherId: teacher.id, learnerId: learner.id, skillId: skill.id, goal: "x",
          durationMinutes: 60, escrowMinutes: 60,
          startAt: new Date("2030-02-01T10:00:00Z"), endAt: new Date("2030-02-01T12:00:00Z"),
        },
      }),
    ).rejects.toThrow(/sessions_end_matches_duration/);
  });

  it("stores Arabic text intact (UTF-8 database)", async () => {
    const u = await makeUser();
    await db.user.update({ where: { id: u.id }, data: { bio: "مرحباً بالعالم — ١٢٣" } });
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).bio).toBe("مرحباً بالعالم — ١٢٣");
  });
});
