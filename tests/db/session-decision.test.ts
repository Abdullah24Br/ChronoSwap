import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import {
  acceptSessionRequest,
  autoRejectExpiredRequests,
  rejectSessionRequest,
  requestSession,
  withdrawSessionRequest,
} from "@/server/services/sessions/booking-service";
import { grantWelcomeBonus } from "@/server/services/wallet/wallet-service";

afterAll(() => db.$disconnect());

async function makeTestUser(displayName = "مستخدم القرار", timezone = "UTC") {
  return db.user.create({
    data: {
      email: `decision-${randomUUID()}@chronoswap.test`,
      passwordHash: "hash",
      displayName,
      emailVerifiedAt: new Date(),
      timezone,
      wallet: { create: {} },
    },
  });
}

async function makeSkill() {
  const category = await db.skillCategory.create({
    data: {
      slug: `cat-${randomUUID()}`,
      nameAr: `تصنيف-${randomUUID().slice(0, 6)}`,
    },
  });

  return db.skill.create({
    data: {
      categoryId: category.id,
      slug: `skill-${randomUUID()}`,
      nameAr: "تصميم واجهات",
    },
  });
}

function getFutureDate(hoursAhead = 24): Date {
  const d = new Date();
  d.setTime(d.getTime() + hoursAhead * 60 * 60 * 1000);
  return d;
}

describe("Teacher Decisions & Auto-Reject (FR-4.2)", () => {
  it("allows teacher to accept a session request and stores meetingUrl", async () => {
    const teacher = await makeTestUser("المعلم أحمد");
    const learner = await makeTestUser("المتعلم يوسف");
    const skill = await makeSkill();

    await db.userSkill.create({
      data: { userId: teacher.id, skillId: skill.id, kind: "OFFERED" },
    });

    // Broad availability slot covering all week
    for (let i = 0; i <= 6; i++) {
      await db.availabilitySlot.create({
        data: { userId: teacher.id, weekday: i, startMinute: 0, endMinute: 1440, timezone: "UTC" },
      });
    }

    await grantWelcomeBonus(db, learner.id);

    const startAt = getFutureDate(24);
    const session = await requestSession(learner.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      durationMinutes: 60,
      startAt,
      goal: "جلسة للتأكيد والقبول",
    });

    expect(session.status).toBe("PENDING");

    // Teacher accepts session with meeting URL
    const accepted = await acceptSessionRequest(teacher.id, {
      sessionId: session.id,
      meetingUrl: "https://meet.google.com/abc-defg-hij",
    });

    expect(accepted.status).toBe("ACCEPTED");
    expect(accepted.meetingUrl).toBe("https://meet.google.com/abc-defg-hij");
    expect(accepted.respondedAt).not.toBeNull();

    // Verify SessionEvent trigger
    const event = await db.sessionEvent.findFirst({
      where: { sessionId: session.id, trigger: "FR-4.2:accept" },
    });
    expect(event).not.toBeNull();
    expect(event?.fromStatus).toBe("PENDING");
    expect(event?.toStatus).toBe("ACCEPTED");
    expect(event?.actorId).toBe(teacher.id);

    // Verify escrow is still frozen in learner's wallet
    const learnerWallet = await db.wallet.findUniqueOrThrow({
      where: { userId: learner.id },
    });
    expect(learnerWallet.frozenMinutes).toBe(60);
    expect(learnerWallet.availableMinutes).toBe(60);
  });

  it("auto-rejects overlapping pending sessions when teacher accepts a session (slot-taken)", async () => {
    const teacher = await makeTestUser("المعلم خالد");
    const learner1 = await makeTestUser("المتعلم الأول");
    const learner2 = await makeTestUser("المتعلم الثاني");
    const skill = await makeSkill();

    await db.userSkill.create({
      data: { userId: teacher.id, skillId: skill.id, kind: "OFFERED" },
    });

    for (let i = 0; i <= 6; i++) {
      await db.availabilitySlot.create({
        data: { userId: teacher.id, weekday: i, startMinute: 0, endMinute: 1440, timezone: "UTC" },
      });
    }

    await grantWelcomeBonus(db, learner1.id);
    await grantWelcomeBonus(db, learner2.id);

    const startAt1 = getFutureDate(30);
    // Session 1: 30 hours from now, 60 minutes
    const s1 = await requestSession(learner1.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      durationMinutes: 60,
      startAt: startAt1,
      goal: "الجلسة الأولى",
    });

    // Session 2: manually created as PENDING at an overlapping time with same teacher
    // (start 30 minutes after s1 starts, duration 60m)
    const startAt2 = new Date(startAt1.getTime() + 30 * 60 * 1000);
    const endAt2 = new Date(startAt2.getTime() + 60 * 60 * 1000);
    const s2 = await db.session.create({
      data: {
        kind: "DIRECT",
        status: "PENDING",
        learnerId: learner2.id,
        teacherId: teacher.id,
        skillId: skill.id,
        durationMinutes: 60,
        escrowMinutes: 60,
        goal: "جلسة متداخلة",
        startAt: startAt2,
        endAt: endAt2,
      },
    });

    // Freeze escrow for s2
    await db.wallet.update({
      where: { userId: learner2.id },
      data: { availableMinutes: 60, frozenMinutes: 60 },
    });

    // Teacher accepts Session 1
    await acceptSessionRequest(teacher.id, { sessionId: s1.id });

    // Session 1 is ACCEPTED
    const updatedS1 = await db.session.findUniqueOrThrow({ where: { id: s1.id } });
    expect(updatedS1.status).toBe("ACCEPTED");

    // Session 2 was automatically rejected due to slot-taken
    const updatedS2 = await db.session.findUniqueOrThrow({ where: { id: s2.id } });
    expect(updatedS2.status).toBe("AUTO_REJECTED");
    expect(updatedS2.cancelReason).toContain("تضارب مع جلسة أخرى");

    // Session 2's event
    const eventS2 = await db.sessionEvent.findFirst({
      where: { sessionId: s2.id, trigger: "FR-4.2:slot-taken" },
    });
    expect(eventS2).not.toBeNull();

    // Learner 2 was refunded: 60 frozen -> 0 frozen, 60 available -> 120 available
    const wallet2 = await db.wallet.findUniqueOrThrow({ where: { userId: learner2.id } });
    expect(wallet2.frozenMinutes).toBe(0);
    expect(wallet2.availableMinutes).toBe(120);
  });

  it("refunds learner when teacher rejects a direct session", async () => {
    const teacher = await makeTestUser("المعلم أحمد");
    const learner = await makeTestUser("المتعلم عمر");
    const skill = await makeSkill();

    await db.userSkill.create({
      data: { userId: teacher.id, skillId: skill.id, kind: "OFFERED" },
    });

    for (let i = 0; i <= 6; i++) {
      await db.availabilitySlot.create({
        data: { userId: teacher.id, weekday: i, startMinute: 0, endMinute: 1440, timezone: "UTC" },
      });
    }

    await grantWelcomeBonus(db, learner.id);

    const startAt = getFutureDate(40);
    const session = await requestSession(learner.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      durationMinutes: 60,
      startAt,
      goal: "جلسة سيتم رفضها",
    });

    // Teacher rejects request
    const rejected = await rejectSessionRequest(teacher.id, {
      sessionId: session.id,
      reason: "عذراً، لدي التزام عائلي مفاجئ في هذا التوقيت",
    });

    expect(rejected.status).toBe("REJECTED");
    expect(rejected.cancelReason).toContain("التزام عائلي");

    // Event logged
    const event = await db.sessionEvent.findFirst({
      where: { sessionId: session.id, trigger: "FR-4.2:reject" },
    });
    expect(event).not.toBeNull();
    expect(event?.actorId).toBe(teacher.id);

    // Learner wallet is refunded: 120 available, 0 frozen
    const learnerWallet = await db.wallet.findUniqueOrThrow({
      where: { userId: learner.id },
    });
    expect(learnerWallet.frozenMinutes).toBe(0);
    expect(learnerWallet.availableMinutes).toBe(120);

    // Refund ledger entry written
    const refundEntry = await db.ledgerEntry.findFirst({
      where: { sessionId: session.id, type: "SESSION_REFUND" },
    });
    expect(refundEntry).not.toBeNull();
    expect(refundEntry?.availableDelta).toBe(60);
    expect(refundEntry?.frozenDelta).toBe(-60);
  });

  it("auto-rejects expired sessions where start time has passed without response", async () => {
    const teacher = await makeTestUser("المعلم المنشغل");
    const learner = await makeTestUser("المتعلم المنتظر");
    const skill = await makeSkill();

    await grantWelcomeBonus(db, learner.id);

    // Manually create an expired session whose start time was 10 minutes ago
    const pastStartAt = new Date(Date.now() - 10 * 60 * 1000);
    const pastEndAt = new Date(pastStartAt.getTime() + 60 * 60 * 1000);

    const session = await db.session.create({
      data: {
        kind: "DIRECT",
        status: "PENDING",
        learnerId: learner.id,
        teacherId: teacher.id,
        skillId: skill.id,
        durationMinutes: 60,
        escrowMinutes: 60,
        goal: "جلسة انتهت مهلتها",
        startAt: pastStartAt,
        endAt: pastEndAt,
      },
    });

    await db.wallet.update({
      where: { userId: learner.id },
      data: { availableMinutes: 60, frozenMinutes: 60 },
    });

    // Run auto-reject job
    const result = await autoRejectExpiredRequests(db);
    expect(result.rejectedCount).toBeGreaterThanOrEqual(1);

    // Check session status is now AUTO_REJECTED
    const updated = await db.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(updated.status).toBe("AUTO_REJECTED");
    expect(updated.cancelReason).toContain("عدم استجابة المدرّس");

    // Event logged
    const event = await db.sessionEvent.findFirst({
      where: { sessionId: session.id, trigger: "FR-4.2:no-response" },
    });
    expect(event).not.toBeNull();

    // Learner is refunded
    const learnerWallet = await db.wallet.findUniqueOrThrow({ where: { userId: learner.id } });
    expect(learnerWallet.frozenMinutes).toBe(0);
    expect(learnerWallet.availableMinutes).toBe(120);
  });

  it("allows learner to withdraw their pending request before response", async () => {
    const teacher = await makeTestUser("المعلم أحمد");
    const learner = await makeTestUser("المتعلم المتراجع");
    const skill = await makeSkill();

    await db.userSkill.create({
      data: { userId: teacher.id, skillId: skill.id, kind: "OFFERED" },
    });

    for (let i = 0; i <= 6; i++) {
      await db.availabilitySlot.create({
        data: { userId: teacher.id, weekday: i, startMinute: 0, endMinute: 1440, timezone: "UTC" },
      });
    }

    await grantWelcomeBonus(db, learner.id);

    const startAt = getFutureDate(50);
    const session = await requestSession(learner.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      durationMinutes: 60,
      startAt,
      goal: "طلب سأتراجع عنه",
    });

    // Learner withdraws
    const withdrawn = await withdrawSessionRequest(learner.id, session.id);
    expect(withdrawn.status).toBe("CANCELLED");
    expect(withdrawn.cancelledById).toBe(learner.id);

    // Event logged
    const event = await db.sessionEvent.findFirst({
      where: { sessionId: session.id, trigger: "FR-4.6:learner-withdraw" },
    });
    expect(event).not.toBeNull();

    // Learner is refunded
    const learnerWallet = await db.wallet.findUniqueOrThrow({ where: { userId: learner.id } });
    expect(learnerWallet.frozenMinutes).toBe(0);
    expect(learnerWallet.availableMinutes).toBe(120);
  });

  it("prevents unauthorized users from accepting or rejecting sessions", async () => {
    const teacher = await makeTestUser("المعلم أحمد");
    const learner = await makeTestUser("المتعلم عمر");
    const thirdParty = await makeTestUser("طرف ثالث");
    const skill = await makeSkill();

    await db.userSkill.create({
      data: { userId: teacher.id, skillId: skill.id, kind: "OFFERED" },
    });

    for (let i = 0; i <= 6; i++) {
      await db.availabilitySlot.create({
        data: { userId: teacher.id, weekday: i, startMinute: 0, endMinute: 1440, timezone: "UTC" },
      });
    }

    await grantWelcomeBonus(db, learner.id);

    const startAt = getFutureDate(60);
    const session = await requestSession(learner.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      durationMinutes: 60,
      startAt,
      goal: "جلسة لاختبار الصلاحيات",
    });

    // Third party tries to accept
    await expect(
      acceptSessionRequest(thirdParty.id, { sessionId: session.id }),
    ).rejects.toThrow(DomainError);

    // Third party tries to reject
    await expect(
      rejectSessionRequest(thirdParty.id, { sessionId: session.id }),
    ).rejects.toThrow(DomainError);

    // Third party tries to withdraw
    await expect(
      withdrawSessionRequest(thirdParty.id, session.id),
    ).rejects.toThrow(DomainError);
  });
});

