import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import { acceptSessionRequest, requestSession } from "@/server/services/sessions/booking-service";
import { grantWelcomeBonus } from "@/server/services/wallet/wallet-service";

afterAll(() => db.$disconnect());

// FR-4.1: nobody can hold two overlapping requests/sessions, and the message says whose
// calendar is taken.

async function makeUser(name: string) {
  return db.user.create({
    data: {
      email: `conflict-${randomUUID()}@chronoswap.test`,
      passwordHash: "hash",
      displayName: name,
      emailVerifiedAt: new Date(),
      timezone: "UTC",
      wallet: { create: {} },
    },
  });
}

async function makeTeacher() {
  const teacher = await makeUser("مدرّس التعارض");
  const category = await db.skillCategory.create({
    data: { slug: `cat-${randomUUID()}`, nameAr: `تصنيف-${randomUUID().slice(0, 6)}` },
  });
  const skill = await db.skill.create({
    data: { categoryId: category.id, slug: `skill-${randomUUID()}`, nameAr: "بايثون" },
  });
  await db.userSkill.create({ data: { userId: teacher.id, skillId: skill.id, kind: "OFFERED" } });
  await db.availabilitySlot.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      userId: teacher.id,
      weekday,
      startMinute: 0,
      endMinute: 1440,
      timezone: "UTC",
    })),
  });
  return { teacher, skill };
}

async function makeLearner(name = "متعلّم التعارض") {
  const learner = await makeUser(name);
  await grantWelcomeBonus(db, learner.id);
  return learner;
}

function at(hoursAhead: number) {
  const d = new Date(Date.now() + hoursAhead * 3_600_000);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
    return "OK";
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
}

describe("Booking conflicts (FR-4.1)", () => {
  it("booking the same teacher again at the same time says the learner already booked it", async () => {
    const { teacher, skill } = await makeTeacher();
    const learner = await makeLearner();
    const startAt = at(30);
    const base = { teacherId: teacher.id, skillId: skill.id, durationMinutes: 30 as const, startAt };

    const first = await requestSession(learner.id, { ...base, goal: "الجلسة الأولى عن الحلقات" });

    // Same time, and a time that only partly overlaps: both refused while the first is pending…
    await expect(requestSession(learner.id, { ...base, goal: "مرة ثانية" })).rejects.toThrow(
      "أرسلت مسبقاً طلب حجز مع هذا المدرّس في هذا الوقت",
    );
    const partly = new Date(startAt.getTime() + 15 * 60_000);
    expect(await codeOf(requestSession(learner.id, { ...base, startAt: partly, goal: "تداخل جزئي" }))).toBe(
      "ALREADY_BOOKED",
    );

    // …and once it is accepted.
    await acceptSessionRequest(teacher.id, { sessionId: first.id, meetingUrl: "https://meet.google.com/abc-defg-hij" });
    await expect(requestSession(learner.id, { ...base, goal: "مرة ثالثة" })).rejects.toThrow(
      "لديك جلسة محجوزة مسبقاً مع هذا المدرّس في هذا الوقت",
    );

    // Right after it ends is fine (sessions are [start, end)).
    const after = new Date(startAt.getTime() + 30 * 60_000);
    expect(await codeOf(requestSession(learner.id, { ...base, startAt: after, goal: "الجلسة التالية مباشرة" }))).toBe(
      "OK",
    );

    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: learner.id } });
    expect(wallet.frozenMinutes).toBe(60); // only the two sessions that were really created
  });

  it("another learner is told the teacher is busy", async () => {
    const { teacher, skill } = await makeTeacher();
    const first = await makeLearner("المتعلّم الأول");
    const second = await makeLearner("المتعلّم الثاني");
    const startAt = at(40);
    const base = { teacherId: teacher.id, skillId: skill.id, durationMinutes: 30 as const, startAt };

    await requestSession(first.id, { ...base, goal: "حجز المتعلّم الأول" });
    await expect(requestSession(second.id, { ...base, goal: "حجز المتعلّم الثاني" })).rejects.toThrow(
      "المدرّس مشغول في هذا الوقت ولديه جلسة أخرى",
    );
  });

  it("a double click creates one request, not two", async () => {
    const { teacher, skill } = await makeTeacher();
    const learner = await makeLearner();
    const input = { teacherId: teacher.id, skillId: skill.id, durationMinutes: 30 as const, startAt: at(50), goal: "نقرة مزدوجة" };

    const results = await Promise.all(Array.from({ length: 8 }, () => 0).map(() => codeOf(requestSession(learner.id, input))));
    expect(results.filter((r) => r === "OK")).toHaveLength(1);
    expect(results.filter((r) => r === "ALREADY_BOOKED")).toHaveLength(7);

    const sessions = await db.session.count({ where: { learnerId: learner.id, teacherId: teacher.id } });
    expect(sessions).toBe(1);
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: learner.id } });
    expect(wallet.frozenMinutes).toBe(30);
  });
});
