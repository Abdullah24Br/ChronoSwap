import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import * as geminiClient from "@/server/services/ai/gemini-client";
import { toggleAgendaTask } from "@/server/services/ai/agenda-service";
import { submitQuizAttempt } from "@/server/services/ai/summary-quiz-service";
import { acceptSessionRequest, requestSession } from "@/server/services/sessions/booking-service";
import { getLearningArchive } from "@/server/services/sessions/archive-service";
import { rateTeacher } from "@/server/services/sessions/rating-service";
import { completeSessionByParticipant, getSessionRoomData } from "@/server/services/sessions/room-service";
import { grantWelcomeBonus } from "@/server/services/wallet/wallet-service";

afterAll(() => db.$disconnect());

const MINUTE = 60_000;

const AI_RESPONSE = JSON.stringify({
  summary: "تعرّف المتعلم على الحلقات في بايثون وطبّقها.",
  keyPoints: ["for تمر على عناصر مجموعة", "while تتكرر ما دام الشرط صحيحاً"],
  exercises: [{ title: "جدول الضرب", description: "اطبع جدول ضرب العدد 7 بحلقة for" }],
  questions: [
    { prompt: "ما ناتج len(range(3))؟", options: ["2", "3", "4"], correctOption: 1 },
    { prompt: "أي حلقة تعتمد على شرط؟", options: ["while", "for", "if"], correctOption: 0 },
    { prompt: "ما الكلمة لإيقاف الحلقة؟", options: ["stop", "exit", "break"], correctOption: 2 },
  ],
});

async function makeUser(label: string) {
  return db.user.create({
    data: {
      email: `life-${label}-${randomUUID()}@chronoswap.test`,
      passwordHash: "hash",
      displayName: `مستخدم ${label}`,
      emailVerifiedAt: new Date(),
      timezone: "UTC",
      wallet: { create: {} },
    },
  });
}

async function wallet(userId: string) {
  return db.wallet.findUniqueOrThrow({ where: { userId } });
}

/** NFR-2: the cached balances always equal the sum of the user's ledger rows. */
async function expectLedgerMatchesWallet(userId: string) {
  const w = await wallet(userId);
  const sums = await db.ledgerEntry.aggregate({
    where: { walletId: w.id },
    _sum: { availableDelta: true, frozenDelta: true, debtDelta: true },
  });
  expect(sums._sum.availableDelta ?? 0).toBe(w.availableMinutes);
  expect(sums._sum.frozenDelta ?? 0).toBe(w.frozenMinutes);
  expect(sums._sum.debtDelta ?? 0).toBe(w.debtMinutes);
}

describe("A direct session from request to archive (end to end)", () => {
  it("runs FR-4.1 → FR-4.2 → FR-5.1 → FR-6.1 → FR-8.1 → FR-8.3 → FR-6.2 → FR-5.5 with consistent balances", async () => {
    const unique = randomUUID();
    const category = await db.skillCategory.create({
      data: { slug: `life-cat-${unique}`, nameAr: `برمجة ${unique.slice(0, 6)}` },
    });
    const skill = await db.skill.create({
      data: { categoryId: category.id, slug: `life-py-${unique}`, nameAr: "بايثون" },
    });
    const learner = await makeUser("learner");
    const teacher = await makeUser("teacher");
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

    // FR-1.2: welcome bonus
    await grantWelcomeBonus(db, learner.id);
    expect((await wallet(learner.id)).availableMinutes).toBe(120);

    // FR-4.1 + FR-2.2: request freezes the duration
    const start = new Date(Date.now() + 3 * 60 * MINUTE);
    start.setUTCMinutes(0, 0, 0);
    const requested = await requestSession(learner.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      startAt: start,
      durationMinutes: 60,
      goal: "أريد فهم الحلقات for و while في بايثون",
    });
    expect(requested.status).toBe("PENDING");
    expect(await wallet(learner.id)).toMatchObject({ availableMinutes: 60, frozenMinutes: 60 });

    // FR-4.2: teacher accepts
    await acceptSessionRequest(teacher.id, { sessionId: requested.id });

    // FR-5.1 / Q-8: both enter the room around the start → IN_PROGRESS
    await getSessionRoomData(requested.id, teacher.id, db, start);
    const room = await getSessionRoomData(requested.id, learner.id, db, new Date(start.getTime() + 2 * MINUTE));
    expect(room.status).toBe("IN_PROGRESS");

    // FR-5.4: tick at least half of the agenda (FR-4.4 fallback agenda: tests have no AI key)
    const tasks = await db.agendaTask.findMany({
      where: { sessionId: requested.id },
      orderBy: { position: "asc" },
    });
    expect(tasks.length).toBeGreaterThan(0);
    for (const task of tasks.slice(0, Math.ceil(tasks.length / 2))) {
      await toggleAgendaTask(task.id, learner.id, db);
    }

    // FR-6.1: complete; FR-8.1 summary + quiz are generated in the background (mocked AI)
    const spy = vi.spyOn(geminiClient, "callGemini").mockResolvedValue(AI_RESPONSE);
    const ended = await completeSessionByParticipant(teacher.id, requested.id, db, new Date(start.getTime() + 50 * MINUTE));
    expect(ended.status).toBe("ENDED");

    let status = ended.status as string;
    for (let i = 0; i < 50 && status !== "QUIZ_PENDING"; i++) {
      await new Promise((r) => setTimeout(r, 100));
      status = (await db.session.findUniqueOrThrow({ where: { id: requested.id } })).status;
    }
    spy.mockRestore();
    expect(status).toBe("QUIZ_PENDING");

    // Ticking after the end is refused: the agenda is now evidence (Q-13, FR-7.2)
    await expect(toggleAgendaTask(tasks[tasks.length - 1].id, teacher.id, db)).rejects.toThrow();

    // FR-8.3 + FR-2.3: solving the quiz releases the hours to the teacher
    const quiz = await submitQuizAttempt(
      { sessionId: requested.id, learnerId: learner.id, answers: [1, 0, 2] },
      db,
      new Date(start.getTime() + 2 * 60 * MINUTE),
    );
    expect(quiz.correctCount).toBe(3);
    expect(quiz.status).toBe("RELEASED");
    expect(await wallet(learner.id)).toMatchObject({ availableMinutes: 60, frozenMinutes: 0 });
    expect(await wallet(teacher.id)).toMatchObject({ availableMinutes: 60, frozenMinutes: 0 });

    // FR-6.2: rating
    await rateTeacher({ sessionId: requested.id, raterId: learner.id, stars: 5, review: "شرح ممتاز" });
    const rated = await db.user.findUniqueOrThrow({ where: { id: teacher.id } });
    expect(rated.ratingCount).toBe(1);
    expect(rated.ratingSum).toBe(5);

    // FR-5.5 / FR-8.2: archive keeps the summary and the quiz result
    const archive = await getLearningArchive(learner.id);
    expect(archive).toHaveLength(1);
    expect(archive[0].summary?.exercises).toHaveLength(1);
    expect(archive[0].quiz).toEqual({ correctCount: 3, totalCount: 3 });

    // NFR-2: balances are exactly the ledger
    await expectLedgerMatchesWallet(learner.id);
    await expectLedgerMatchesWallet(teacher.id);

    // The state machine history is complete and in order
    const events = await db.sessionEvent.findMany({
      where: { sessionId: requested.id },
      orderBy: { createdAt: "asc" },
      select: { toStatus: true },
    });
    expect(events.map((e) => e.toStatus)).toEqual([
      "PENDING",
      "ACCEPTED",
      "IN_PROGRESS",
      "ENDED",
      "QUIZ_PENDING",
      "RELEASED",
    ]);
  });

  it("refuses a request that starts less than 2 hours from now (Q-11)", async () => {
    const unique = randomUUID();
    const category = await db.skillCategory.create({
      data: { slug: `soon-cat-${unique}`, nameAr: `تصنيف ${unique.slice(0, 6)}` },
    });
    const skill = await db.skill.create({
      data: { categoryId: category.id, slug: `soon-${unique}`, nameAr: "إنجليزية" },
    });
    const learner = await makeUser("soon-learner");
    const teacher = await makeUser("soon-teacher");
    await db.userSkill.create({ data: { userId: teacher.id, skillId: skill.id, kind: "OFFERED" } });
    await grantWelcomeBonus(db, learner.id);

    await expect(
      requestSession(learner.id, {
        teacherId: teacher.id,
        skillId: skill.id,
        startAt: new Date(Date.now() + 60 * MINUTE),
        durationMinutes: 30,
        goal: "جلسة بعد ساعة واحدة فقط",
      }),
    ).rejects.toMatchObject({ code: "TOO_SOON" });
    expect((await wallet(learner.id)).frozenMinutes).toBe(0);
  });
});
