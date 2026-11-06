import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { InsufficientBalanceError } from "@/server/errors";
import {
  freezeSessionEscrowTx,
  grantWelcomeBonus,
  refundSessionEscrowTx,
  releaseSessionEscrowTx,
} from "@/server/services/wallet/wallet-service";

afterAll(() => db.$disconnect());

async function makeTestUser(prefix = "escrow-user") {
  return db.user.create({
    data: {
      email: `${prefix}-${randomUUID()}@chronoswap.test`,
      passwordHash: "hash",
      displayName: "مستخدم الضمان",
      emailVerifiedAt: new Date(),
      wallet: { create: {} },
    },
  });
}

async function makeTestSession(opts: { learnerId: string; durationMinutes?: number }) {
  const teacher = await makeTestUser("teacher");

  const category = await db.skillCategory.create({
    data: {
      slug: `cat-${randomUUID()}`,
      nameAr: `تصنيف-${randomUUID().slice(0, 8)}`,
    },
  });

  const skill = await db.skill.create({
    data: {
      categoryId: category.id,
      slug: `skill-${randomUUID()}`,
      nameAr: `مهارة-${randomUUID().slice(0, 8)}`,
    },
  });

  const durationMinutes = opts.durationMinutes ?? 60;
  const startAt = new Date();
  const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);

  return db.session.create({
    data: {
      learnerId: opts.learnerId,
      teacherId: teacher.id,
      skillId: skill.id,
      durationMinutes,
      escrowMinutes: durationMinutes,
      startAt,
      endAt,
      goal: "جلسة اختبار",
      kind: "DIRECT",
      status: "PENDING",
    },
  });
}

describe("Session Escrow Freeze (FR-2.2)", () => {
  it("freezes duration minutes from available to frozen balance and writes ledger entry", async () => {
    const user = await makeTestUser();
    await grantWelcomeBonus(db, user.id); // 120 minutes available

    const session = await makeTestSession({ learnerId: user.id, durationMinutes: 60 });
    const result = await freezeSessionEscrowTx(db, {
      learnerId: user.id,
      sessionId: session.id,
      durationMinutes: 60,
      memo: "حجز جلسة بايثون لمدة 60 دقيقة",
    });

    expect(result.applied).toBe(true);
    expect(result.entry).not.toBeNull();
    expect(result.entry?.type).toBe("SESSION_FREEZE");
    expect(result.entry?.availableDelta).toBe(-60);
    expect(result.entry?.frozenDelta).toBe(60);
    expect(result.entry?.availableAfter).toBe(60);
    expect(result.entry?.frozenAfter).toBe(60);

    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.availableMinutes).toBe(60);
    expect(wallet.frozenMinutes).toBe(60);
    expect(wallet.version).toBe(2);
  });

  it("rejects freeze when available balance is less than required duration (InsufficientBalanceError)", async () => {
    const user = await makeTestUser();
    // User has 0 available minutes

    const session = await makeTestSession({ learnerId: user.id, durationMinutes: 30 });
    await expect(
      freezeSessionEscrowTx(db, {
        learnerId: user.id,
        sessionId: session.id,
        durationMinutes: 30,
      }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);

    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.availableMinutes).toBe(0);
    expect(wallet.frozenMinutes).toBe(0);
  });

  it("is idempotent: replaying the same sessionId freeze does not double-charge", async () => {
    const user = await makeTestUser();
    await grantWelcomeBonus(db, user.id); // 120 minutes

    const session = await makeTestSession({ learnerId: user.id, durationMinutes: 60 });
    const res1 = await freezeSessionEscrowTx(db, {
      learnerId: user.id,
      sessionId: session.id,
      durationMinutes: 60,
    });
    expect(res1.applied).toBe(true);

    // Replay with identical sessionId / idempotency key
    const res2 = await freezeSessionEscrowTx(db, {
      learnerId: user.id,
      sessionId: session.id,
      durationMinutes: 60,
    });
    expect(res2.applied).toBe(false);

    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.availableMinutes).toBe(60);
    expect(wallet.frozenMinutes).toBe(60);
  });

  it("rejects invalid duration <= 0", async () => {
    const user = await makeTestUser();
    await grantWelcomeBonus(db, user.id);

    await expect(
      freezeSessionEscrowTx(db, {
        learnerId: user.id,
        sessionId: randomUUID(),
        durationMinutes: 0,
      }),
    ).rejects.toThrow(/أكبر من الصفر/);
  });
});

describe("Session Escrow Release (FR-2.3)", () => {
  it("transfers frozen minutes from learner to teacher available balance upon completion", async () => {
    const learner = await makeTestUser("learner");
    await grantWelcomeBonus(db, learner.id); // 120 available

    const session = await makeTestSession({ learnerId: learner.id, durationMinutes: 60 });
    // Freeze 60 minutes
    await freezeSessionEscrowTx(db, {
      learnerId: learner.id,
      sessionId: session.id,
      durationMinutes: 60,
    });

    const res = await releaseSessionEscrowTx(db, {
      learnerId: learner.id,
      teacherId: session.teacherId,
      sessionId: session.id,
      durationMinutes: 60,
    });

    expect(res.applied).toBe(true);
    expect(res.debtRepaidMinutes).toBe(0);
    expect(res.learnerEntry?.type).toBe("SESSION_RELEASE_DEBIT");
    expect(res.learnerEntry?.frozenDelta).toBe(-60);
    expect(res.learnerEntry?.frozenAfter).toBe(0);

    expect(res.teacherEntry?.type).toBe("SESSION_RELEASE_CREDIT");
    expect(res.teacherEntry?.availableDelta).toBe(60);
    expect(res.teacherEntry?.debtDelta).toBe(0);
    expect(res.teacherEntry?.availableAfter).toBe(60);

    const learnerWallet = await db.wallet.findUniqueOrThrow({ where: { userId: learner.id } });
    expect(learnerWallet.availableMinutes).toBe(60);
    expect(learnerWallet.frozenMinutes).toBe(0);

    const teacherWallet = await db.wallet.findUniqueOrThrow({ where: { userId: session.teacherId } });
    expect(teacherWallet.availableMinutes).toBe(60);
    expect(teacherWallet.frozenMinutes).toBe(0);
  });

  it("is idempotent: replaying the same release does not credit the teacher twice", async () => {
    const learner = await makeTestUser("learner");
    await grantWelcomeBonus(db, learner.id);

    const session = await makeTestSession({ learnerId: learner.id, durationMinutes: 60 });
    await freezeSessionEscrowTx(db, {
      learnerId: learner.id,
      sessionId: session.id,
      durationMinutes: 60,
    });

    const res1 = await releaseSessionEscrowTx(db, {
      learnerId: learner.id,
      teacherId: session.teacherId,
      sessionId: session.id,
      durationMinutes: 60,
    });
    expect(res1.applied).toBe(true);

    // Replay release with identical keys
    const res2 = await releaseSessionEscrowTx(db, {
      learnerId: learner.id,
      teacherId: session.teacherId,
      sessionId: session.id,
      durationMinutes: 60,
    });
    expect(res2.applied).toBe(false);

    const teacherWallet = await db.wallet.findUniqueOrThrow({ where: { userId: session.teacherId } });
    expect(teacherWallet.availableMinutes).toBe(60); // Not 120
  });

  it("rejects release when learner does not have enough frozen minutes", async () => {
    const learner = await makeTestUser("learner");
    // Learner has 0 frozen minutes

    const session = await makeTestSession({ learnerId: learner.id, durationMinutes: 60 });

    await expect(
      releaseSessionEscrowTx(db, {
        learnerId: learner.id,
        teacherId: session.teacherId,
        sessionId: session.id,
        durationMinutes: 60,
      }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);
  });

  it("automatically repays teacher existing debt FIFO (FR-3.4)", async () => {
    const learner = await makeTestUser("learner");
    await grantWelcomeBonus(db, learner.id);

    const session = await makeTestSession({ learnerId: learner.id, durationMinutes: 60 });
    await freezeSessionEscrowTx(db, {
      learnerId: learner.id,
      sessionId: session.id,
      durationMinutes: 60,
    });

    // Create a debt for teacher: 20 minutes from a previous session
    const debtSession = await makeTestSession({ learnerId: learner.id, durationMinutes: 30 });
    const debt = await db.debt.create({
      data: {
        userId: session.teacherId,
        sessionId: debtSession.id,
        originalMinutes: 20,
        remainingMinutes: 20,
        settledAt: null,
      },
    });

    // Initialize teacher's wallet with debt
    await db.wallet.update({
      where: { userId: session.teacherId },
      data: { debtMinutes: 20 },
    });

    const res = await releaseSessionEscrowTx(db, {
      learnerId: learner.id,
      teacherId: session.teacherId,
      sessionId: session.id,
      durationMinutes: 60,
    });

    expect(res.applied).toBe(true);
    expect(res.debtRepaidMinutes).toBe(20);
    expect(res.teacherEntry?.availableDelta).toBe(40);
    expect(res.teacherEntry?.debtDelta).toBe(-20);

    const teacherWallet = await db.wallet.findUniqueOrThrow({ where: { userId: session.teacherId } });
    expect(teacherWallet.debtMinutes).toBe(0);
    expect(teacherWallet.availableMinutes).toBe(40);

    const updatedDebt = await db.debt.findUniqueOrThrow({ where: { id: debt.id } });
    expect(updatedDebt.remainingMinutes).toBe(0);
    expect(updatedDebt.settledAt).not.toBeNull();
  });
});

describe("Session Escrow Refund (FR-2.4)", () => {
  it("refunds frozen minutes back to learner available balance and writes SESSION_REFUND entry", async () => {
    const learner = await makeTestUser("learner");
    await grantWelcomeBonus(db, learner.id); // 120 available

    const session = await makeTestSession({ learnerId: learner.id, durationMinutes: 60 });
    // Freeze 60 minutes
    await freezeSessionEscrowTx(db, {
      learnerId: learner.id,
      sessionId: session.id,
      durationMinutes: 60,
    });

    const frozenWallet = await db.wallet.findUniqueOrThrow({ where: { userId: learner.id } });
    expect(frozenWallet.availableMinutes).toBe(60);
    expect(frozenWallet.frozenMinutes).toBe(60);

    // Refund 60 minutes (rejection / cancellation / no-show / dispute)
    const res = await refundSessionEscrowTx(db, {
      learnerId: learner.id,
      sessionId: session.id,
      durationMinutes: 60,
      memo: "استرجاع رصيد لإلغاء الجلسة",
    });

    expect(res.applied).toBe(true);
    expect(res.entry).not.toBeNull();
    expect(res.entry?.type).toBe("SESSION_REFUND");
    expect(res.entry?.frozenDelta).toBe(-60);
    expect(res.entry?.availableDelta).toBe(60);
    expect(res.entry?.availableAfter).toBe(120);
    expect(res.entry?.frozenAfter).toBe(0);

    const refundedWallet = await db.wallet.findUniqueOrThrow({ where: { userId: learner.id } });
    expect(refundedWallet.availableMinutes).toBe(120);
    expect(refundedWallet.frozenMinutes).toBe(0);
    expect(refundedWallet.version).toBe(3);
  });

  it("is idempotent: replaying the same refund does not increase available balance twice", async () => {
    const learner = await makeTestUser("learner");
    await grantWelcomeBonus(db, learner.id);

    const session = await makeTestSession({ learnerId: learner.id, durationMinutes: 60 });
    await freezeSessionEscrowTx(db, {
      learnerId: learner.id,
      sessionId: session.id,
      durationMinutes: 60,
    });

    const res1 = await refundSessionEscrowTx(db, {
      learnerId: learner.id,
      sessionId: session.id,
      durationMinutes: 60,
    });
    expect(res1.applied).toBe(true);

    // Replay with identical sessionId / idempotency key
    const res2 = await refundSessionEscrowTx(db, {
      learnerId: learner.id,
      sessionId: session.id,
      durationMinutes: 60,
    });
    expect(res2.applied).toBe(false);

    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: learner.id } });
    expect(wallet.availableMinutes).toBe(120); // Not 180
    expect(wallet.frozenMinutes).toBe(0);
  });

  it("rejects refund when frozen balance is insufficient (InsufficientBalanceError)", async () => {
    const learner = await makeTestUser("learner");
    // Learner has 0 frozen minutes

    const session = await makeTestSession({ learnerId: learner.id, durationMinutes: 60 });

    await expect(
      refundSessionEscrowTx(db, {
        learnerId: learner.id,
        sessionId: session.id,
        durationMinutes: 60,
      }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);

    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: learner.id } });
    expect(wallet.availableMinutes).toBe(0);
    expect(wallet.frozenMinutes).toBe(0);
  });

  it("rejects invalid refund duration <= 0", async () => {
    const learner = await makeTestUser("learner");
    await grantWelcomeBonus(db, learner.id);

    await expect(
      refundSessionEscrowTx(db, {
        learnerId: learner.id,
        sessionId: randomUUID(),
        durationMinutes: 0,
      }),
    ).rejects.toThrow(/أكبر من الصفر/);
  });
});
