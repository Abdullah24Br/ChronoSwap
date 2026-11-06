import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { InsufficientBalanceError } from "@/server/errors";
import {
  proposeBarterCycle,
  respondToBarterProposal,
} from "@/server/services/barter/barter-service";
import { requestSession } from "@/server/services/sessions/booking-service";
import { grantWelcomeBonus } from "@/server/services/wallet/wallet-service";

afterAll(() => db.$disconnect());

async function makeTestUser(displayName = "مستخدم الحجز", timezone = "UTC") {
  return db.user.create({
    data: {
      email: `booking-${randomUUID()}@chronoswap.test`,
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
      nameAr: "تطوير الويب",
    },
  });
}

/**
 * Creates a future date on next weekday at specific hour/minute in target timezone.
 */
function getFutureDateForSlot(targetWeekday: number, hour: number, minute: number): Date {
  const now = new Date();
  const d = new Date(now);
  // Add 1 to 7 days to get into the future
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() !== targetWeekday) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

describe("Session Booking Request (FR-4.1)", () => {
  it("books a direct session successfully with atomic escrow freeze", async () => {
    const teacher = await makeTestUser("المعلم أحمد", "UTC");
    const learner = await makeTestUser("المتعلم عمر", "UTC");
    const skill = await makeSkill();

    // Teacher offers skill
    await db.userSkill.create({
      data: { userId: teacher.id, skillId: skill.id, kind: "OFFERED" },
    });

    // Teacher sets availability on Tuesdays (weekday 2): 09:00 (540) to 15:00 (900)
    await db.availabilitySlot.create({
      data: {
        userId: teacher.id,
        weekday: 2,
        startMinute: 540,
        endMinute: 900,
        timezone: "UTC",
      },
    });

    // Grant welcome bonus (120 min) to learner
    await grantWelcomeBonus(db, learner.id);

    // Pick next Tuesday at 10:00 (600)
    const startAt = getFutureDateForSlot(2, 10, 0);

    const session = await requestSession(learner.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      durationMinutes: 60,
      startAt,
      goal: "شرح معمق لأساسيات تطوير الويب بالرياكت",
    });

    expect(session.id).toBeDefined();
    expect(session.kind).toBe("DIRECT");
    expect(session.status).toBe("PENDING");
    expect(session.durationMinutes).toBe(60);
    expect(session.escrowMinutes).toBe(60);

    // Check learner's wallet: 120 - 60 = 60 available, 60 frozen
    const learnerWallet = await db.wallet.findUniqueOrThrow({
      where: { userId: learner.id },
    });
    expect(learnerWallet.availableMinutes).toBe(60);
    expect(learnerWallet.frozenMinutes).toBe(60);

    // Check SessionEvent audit trail
    const event = await db.sessionEvent.findFirst({
      where: { sessionId: session.id, trigger: "FR-4.1:request" },
    });
    expect(event).not.toBeNull();
    expect(event?.toStatus).toBe("PENDING");
    expect(event?.actorId).toBe(learner.id);

    // Check ledger entry
    const ledgerEntry = await db.ledgerEntry.findFirst({
      where: { sessionId: session.id, type: "SESSION_FREEZE" },
    });
    expect(ledgerEntry).not.toBeNull();
    expect(ledgerEntry?.availableDelta).toBe(-60);
    expect(ledgerEntry?.frozenDelta).toBe(60);
  });

  it("fails when learner has insufficient available balance", async () => {
    const teacher = await makeTestUser("المعلم أحمد", "UTC");
    const learner = await makeTestUser("المتعلم بدون رصيد", "UTC");
    const skill = await makeSkill();

    await db.userSkill.create({
      data: { userId: teacher.id, skillId: skill.id, kind: "OFFERED" },
    });

    await db.availabilitySlot.create({
      data: {
        userId: teacher.id,
        weekday: 3,
        startMinute: 600,
        endMinute: 900,
        timezone: "UTC",
      },
    });

    // Learner has 0 minutes available
    const startAt = getFutureDateForSlot(3, 11, 0);

    await expect(
      requestSession(learner.id, {
        teacherId: teacher.id,
        skillId: skill.id,
        durationMinutes: 60,
        startAt,
        goal: "طلب جلسة بدون رصيد متاح",
      }),
    ).rejects.toThrow(InsufficientBalanceError);

    // No session was created
    const count = await db.session.count({ where: { learnerId: learner.id } });
    expect(count).toBe(0);
  });

  it("prevents self-booking", async () => {
    const user = await makeTestUser("مستخدم منفرد", "UTC");
    const skill = await makeSkill();

    await expect(
      requestSession(user.id, {
        teacherId: user.id,
        skillId: skill.id,
        durationMinutes: 30,
        startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        goal: "محاولة حجز لنفسي",
      }),
    ).rejects.toThrow("لا يمكنك حجز جلسة تعليمية مع نفسك");
  });

  it("prevents booking when learner has outstanding debts (Q-16)", async () => {
    const teacher = await makeTestUser("المعلم أحمد", "UTC");
    const learner = await makeTestUser("المتعلم المدين", "UTC");
    const skill = await makeSkill();

    await db.userSkill.create({
      data: { userId: teacher.id, skillId: skill.id, kind: "OFFERED" },
    });

    await db.availabilitySlot.create({
      data: {
        userId: teacher.id,
        weekday: 4,
        startMinute: 600,
        endMinute: 900,
        timezone: "UTC",
      },
    });

    // Put learner in debt
    await db.wallet.update({
      where: { userId: learner.id },
      data: { debtMinutes: 45, availableMinutes: 120 },
    });

    const startAt = getFutureDateForSlot(4, 11, 0);

    await expect(
      requestSession(learner.id, {
        teacherId: teacher.id,
        skillId: skill.id,
        durationMinutes: 60,
        startAt,
        goal: "طلب حجز أثناء وجود ديون",
      }),
    ).rejects.toThrow("ديون سابقة غير مسددة تمنعك من حجز جلسات جديدة");
  });

  it("rejects booking outside teacher availability", async () => {
    const teacher = await makeTestUser("المعلم أحمد", "UTC");
    const learner = await makeTestUser("المتعلم عمر", "UTC");
    const skill = await makeSkill();

    await db.userSkill.create({
      data: { userId: teacher.id, skillId: skill.id, kind: "OFFERED" },
    });

    // Teacher is available only on Sundays 10:00 - 12:00 (600 to 720)
    await db.availabilitySlot.create({
      data: {
        userId: teacher.id,
        weekday: 0,
        startMinute: 600,
        endMinute: 720,
        timezone: "UTC",
      },
    });

    await grantWelcomeBonus(db, learner.id);

    // Case 1: Wrong day (Monday instead of Sunday)
    const mondayDate = getFutureDateForSlot(1, 10, 0);
    await expect(
      requestSession(learner.id, {
        teacherId: teacher.id,
        skillId: skill.id,
        durationMinutes: 60,
        startAt: mondayDate,
        goal: "حجز في يوم غير متاح",
      }),
    ).rejects.toThrow("الموعد المحدد يقع خارج الأوقات المتاحة للمدرّس");

    // Case 2: Right day but outside slot (13:00 - 14:00 instead of 10:00 - 12:00)
    const sundayLate = getFutureDateForSlot(0, 13, 0);
    await expect(
      requestSession(learner.id, {
        teacherId: teacher.id,
        skillId: skill.id,
        durationMinutes: 60,
        startAt: sundayLate,
        goal: "حجز في وقت متأخر عن المتاح",
      }),
    ).rejects.toThrow("الموعد المحدد يقع خارج الأوقات المتاحة للمدرّس");
  });

  it("detects scheduling conflicts and prevents double-booking", async () => {
    const teacher = await makeTestUser("المعلم أحمد", "UTC");
    const learner1 = await makeTestUser("المتعلم الأول", "UTC");
    const learner2 = await makeTestUser("المتعلم الثاني", "UTC");
    const skill = await makeSkill();

    await db.userSkill.create({
      data: { userId: teacher.id, skillId: skill.id, kind: "OFFERED" },
    });

    await db.availabilitySlot.create({
      data: {
        userId: teacher.id,
        weekday: 5,
        startMinute: 500,
        endMinute: 1000,
        timezone: "UTC",
      },
    });

    await grantWelcomeBonus(db, learner1.id);
    await grantWelcomeBonus(db, learner2.id);

    // Learner 1 books 10:00 - 11:00 on Friday
    const startAt = getFutureDateForSlot(5, 10, 0);
    await requestSession(learner1.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      durationMinutes: 60,
      startAt,
      goal: "جلسة المتعلم الأول",
    });

    // Learner 2 tries to book overlapping 10:30 - 11:30 with same teacher
    const overlappingStartAt = new Date(startAt.getTime() + 30 * 60 * 1000);
    await expect(
      requestSession(learner2.id, {
        teacherId: teacher.id,
        skillId: skill.id,
        durationMinutes: 60,
        startAt: overlappingStartAt,
        goal: "محاولة حجز متداخل",
      }),
    ).rejects.toThrow("المدرّس لديه جلسة أخرى في هذا التوقيت المحدد");
  });

  it("enforces weekly pair cap of 180 minutes (FR-6.3)", async () => {
    const teacher = await makeTestUser("المعلم أحمد", "UTC");
    const learner = await makeTestUser("المتعلم الدائم", "UTC");
    const skill = await makeSkill();

    await db.userSkill.create({
      data: { userId: teacher.id, skillId: skill.id, kind: "OFFERED" },
    });

    // Broad availability across the week
    for (let day = 0; day <= 6; day++) {
      await db.availabilitySlot.create({
        data: {
          userId: teacher.id,
          weekday: day,
          startMinute: 500,
          endMinute: 1100,
          timezone: "UTC",
        },
      });
    }

    // Give learner plenty of balance (300 min)
    await db.wallet.update({
      where: { userId: learner.id },
      data: { availableMinutes: 300 },
    });

    // Session 1: Tuesday 10:00 (60 min)
    const tues = getFutureDateForSlot(2, 10, 0);
    await requestSession(learner.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      durationMinutes: 60,
      startAt: tues,
      goal: "الجلسة الأولى في الأسبوع",
    });

    // Session 2: Wednesday 10:00 (60 min) -> total 120 min
    const weds = new Date(tues.getTime() + 24 * 60 * 60 * 1000);
    await requestSession(learner.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      durationMinutes: 60,
      startAt: weds,
      goal: "الجلسة الثانية في الأسبوع",
    });

    // Session 3 attempt: Thursday 10:00 for 90 min -> 120 + 90 = 210 > 180 min -> EXCEEDED
    const thurs = new Date(weds.getTime() + 24 * 60 * 60 * 1000);
    await expect(
      requestSession(learner.id, {
        teacherId: teacher.id,
        skillId: skill.id,
        durationMinutes: 90,
        startAt: thurs,
        goal: "جلسة ستتجاوز الحد الأسبوعي",
      }),
    ).rejects.toThrow("تم تجاوز الحد الأقصى للجلسات بين نفس الطرفين (3 ساعات أسبوعياً)");

    // But a 60 min session (120 + 60 = 180 <= 180) succeeds!
    const validSession = await requestSession(learner.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      durationMinutes: 60,
      startAt: thurs,
      goal: "جلسة تكميلية تصل بالضبط للحد الأقصى 180 دقيقة",
    });
    expect(validSession.id).toBeDefined();
  });

  it("books a barter cycle session with zero escrow freeze (FR-3.4 / FR-4.1)", async () => {
    const userA = await makeTestUser("المستخدم أ", "UTC");
    const userB = await makeTestUser("المستخدم ب", "UTC");
    const userC = await makeTestUser("المستخدم ج", "UTC");

    const cat = await db.skillCategory.create({
      data: { slug: `cat-${randomUUID()}`, nameAr: "تقنية" },
    });
    const s1 = await db.skill.create({ data: { categoryId: cat.id, slug: `s1-${randomUUID()}`, nameAr: "م1" } });
    const s2 = await db.skill.create({ data: { categoryId: cat.id, slug: `s2-${randomUUID()}`, nameAr: "م2" } });
    const s3 = await db.skill.create({ data: { categoryId: cat.id, slug: `s3-${randomUUID()}`, nameAr: "م3" } });

    await db.userSkill.createMany({
      data: [
        { userId: userA.id, skillId: s1.id, kind: "OFFERED" },
        { userId: userB.id, skillId: s2.id, kind: "OFFERED" },
        { userId: userC.id, skillId: s3.id, kind: "OFFERED" },
      ],
    });

    // Broad availability for userA
    await db.availabilitySlot.create({
      data: { userId: userA.id, weekday: 1, startMinute: 500, endMinute: 900, timezone: "UTC" },
    });

    // Create and activate a 60-minute cycle: A (pos 0, teaches s1) -> B (pos 1, teaches s2) -> C (pos 2, teaches s3) -> A
    const cycle = await proposeBarterCycle(userA.id, {
      durationMinutes: 60,
      participants: [
        { userId: userA.id, teachesSkillId: s1.id },
        { userId: userB.id, teachesSkillId: s2.id },
        { userId: userC.id, teachesSkillId: s3.id },
      ],
    });
    await respondToBarterProposal(userB.id, { cycleId: cycle.id, decision: "ACCEPTED" });
    const activeCycle = await respondToBarterProposal(userC.id, { cycleId: cycle.id, decision: "ACCEPTED" });
    expect(activeCycle.status).toBe("ACTIVE");

    // Learner B has 0 minutes balance
    const walletB = await db.wallet.findUniqueOrThrow({ where: { userId: userB.id } });
    expect(walletB.availableMinutes).toBe(0);

    // Learner B books session with Teacher A inside the cycle
    const startAt = getFutureDateForSlot(1, 10, 0);
    const session = await requestSession(userB.id, {
      teacherId: userA.id,
      skillId: s1.id,
      durationMinutes: 60,
      startAt,
      goal: "جلسة مقايضة ثلاثية بدون تجميد رصيد",
      barterCycleId: activeCycle.id,
    });

    expect(session.id).toBeDefined();
    expect(session.kind).toBe("BARTER");
    expect(session.escrowMinutes).toBe(0);
    expect(session.barterCycleId).toBe(activeCycle.id);

    // Wallet B still has 0 available and 0 frozen minutes (no escrow deducted)
    const updatedWalletB = await db.wallet.findUniqueOrThrow({ where: { userId: userB.id } });
    expect(updatedWalletB.availableMinutes).toBe(0);
    expect(updatedWalletB.frozenMinutes).toBe(0);
  });
});

