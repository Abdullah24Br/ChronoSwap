import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import {
  calculateFallbackPhases,
  generateAndSaveSessionAgenda,
  toggleAgendaTask,
} from "@/server/services/ai/agenda-service";
import { requestSession } from "@/server/services/sessions/booking-service";
import { grantWelcomeBonus } from "@/server/services/wallet/wallet-service";

afterAll(() => db.$disconnect());

async function makeTestUser(displayName = "مستخدم الأجندة", timezone = "UTC") {
  return db.user.create({
    data: {
      email: `agenda-${randomUUID()}@chronoswap.test`,
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
      nameAr: "بايثون المتقدم",
    },
  });
}

describe("Session Agenda Planner & Fallback (FR-4.3 / FR-4.4)", () => {
  it("calculates fallback phases accurately matching the 25% / 50% / 25% rule for all allowed durations", () => {
    // 30 min
    const p30 = calculateFallbackPhases(30);
    expect(p30.theoryMinutes + p30.practiceMinutes + p30.reviewMinutes).toBe(30);
    expect(p30.theoryMinutes).toBe(8);
    expect(p30.practiceMinutes).toBe(15);
    expect(p30.reviewMinutes).toBe(7);

    // 60 min
    const p60 = calculateFallbackPhases(60);
    expect(p60.theoryMinutes + p60.practiceMinutes + p60.reviewMinutes).toBe(60);
    expect(p60.theoryMinutes).toBe(15);
    expect(p60.practiceMinutes).toBe(30);
    expect(p60.reviewMinutes).toBe(15);

    // 90 min
    const p90 = calculateFallbackPhases(90);
    expect(p90.theoryMinutes + p90.practiceMinutes + p90.reviewMinutes).toBe(90);
    expect(p90.theoryMinutes).toBe(23);
    expect(p90.practiceMinutes).toBe(45);
    expect(p90.reviewMinutes).toBe(22);

    // 120 min
    const p120 = calculateFallbackPhases(120);
    expect(p120.theoryMinutes + p120.practiceMinutes + p120.reviewMinutes).toBe(120);
    expect(p120.theoryMinutes).toBe(30);
    expect(p120.practiceMinutes).toBe(60);
    expect(p120.reviewMinutes).toBe(30);
  });

  it("generates and saves fallback agenda when AI is unavailable (FR-4.4)", async () => {
    const teacher = await makeTestUser("المعلم");
    const learner = await makeTestUser("المتعلم");
    const skill = await makeSkill();

    const now = new Date();
    const session = await db.session.create({
      data: {
        kind: "DIRECT",
        status: "PENDING",
        learnerId: learner.id,
        teacherId: teacher.id,
        skillId: skill.id,
        durationMinutes: 60,
        escrowMinutes: 60,
        goal: "تعلّم الدوال المتقدمة والمولدات (Generators) في بايثون",
        startAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        endAt: new Date(now.getTime() + 25 * 60 * 60 * 1000),
      },
    });

    // In testing without GEMINI_API_KEY, it should generate fallback agenda
    const tasks = await generateAndSaveSessionAgenda(session.id, db);

    expect(tasks).toHaveLength(3);
    expect(tasks[0].position).toBe(0);
    expect(tasks[0].phase).toBe("THEORY");
    expect(tasks[0].plannedMinutes).toBe(15);
    expect(tasks[0].isDone).toBe(false);

    expect(tasks[1].position).toBe(1);
    expect(tasks[1].phase).toBe("PRACTICE");
    expect(tasks[1].plannedMinutes).toBe(30);

    expect(tasks[2].position).toBe(2);
    expect(tasks[2].phase).toBe("REVIEW");
    expect(tasks[2].plannedMinutes).toBe(15);

    // Sum of planned minutes must equal duration
    const totalMinutes = tasks.reduce((sum, t) => sum + t.plannedMinutes, 0);
    expect(totalMinutes).toBe(60);

    // Session metadata is updated
    const updatedSession = await db.session.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(updatedSession.agendaSource).toBe("FALLBACK");
    expect(updatedSession.agendaGeneratedAt).not.toBeNull();

    // Idempotency: calling again returns the existing tasks
    const tasksAgain = await generateAndSaveSessionAgenda(session.id, db);
    expect(tasksAgain).toHaveLength(3);
    expect(tasksAgain[0].id).toBe(tasks[0].id);
  });

  it("allows participants to toggle checklist tasks and tracks completion percentage (FR-5.4 / FR-6.1)", async () => {
    const teacher = await makeTestUser("المعلم أحمد");
    const learner = await makeTestUser("المتعلم عمر");
    const skill = await makeSkill();

    const now = new Date();
    const session = await db.session.create({
      data: {
        kind: "DIRECT",
        status: "ACCEPTED",
        learnerId: learner.id,
        teacherId: teacher.id,
        skillId: skill.id,
        durationMinutes: 60,
        escrowMinutes: 60,
        goal: "جلسة تفاعلية لتأشير المهام",
        startAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        endAt: new Date(now.getTime() + 25 * 60 * 60 * 1000),
      },
    });

    const tasks = await generateAndSaveSessionAgenda(session.id, db);
    const [task0, task1, task2] = tasks;

    // 1. Teacher ticks task 0
    const res1 = await toggleAgendaTask(task0.id, teacher.id, db);
    expect(res1.task.isDone).toBe(true);
    expect(res1.task.doneAt).not.toBeNull();
    expect(res1.task.doneById).toBe(teacher.id);
    expect(res1.completionPercent).toBe(33); // 1 / 3 = 33%

    // 2. Learner ticks task 1
    const res2 = await toggleAgendaTask(task1.id, learner.id, db);
    expect(res2.task.isDone).toBe(true);
    expect(res2.task.doneById).toBe(learner.id);
    expect(res2.completionPercent).toBe(67); // 2 / 3 = 67% (>= 50% threshold for completion)

    // Verify session row updated completionPercent
    const sessionAfter2 = await db.session.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(sessionAfter2.completionPercent).toBe(67);

    // 3. Learner un-ticks task 1
    const res3 = await toggleAgendaTask(task1.id, learner.id, db);
    expect(res3.task.isDone).toBe(false);
    expect(res3.task.doneAt).toBeNull();
    expect(res3.task.doneById).toBeNull();
    expect(res3.completionPercent).toBe(33);

    // 4. Unauthorized user cannot toggle
    const stranger = await makeTestUser("مستخدم غريب");
    await expect(
      toggleAgendaTask(task2.id, stranger.id, db),
    ).rejects.toThrow(DomainError);
  });

  it("automatically generates agenda upon session request (FR-4.1 + FR-4.3/4.4)", async () => {
    const teacher = await makeTestUser("المعلم سامر");
    const learner = await makeTestUser("المتعلم يحيى");
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

    const session = await requestSession(learner.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      durationMinutes: 90,
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      goal: "جلسة 90 دقيقة لاختبار التوليد التلقائي للأجندة",
    });

    // Verify tasks were generated automatically
    const agendaTasks = await db.agendaTask.findMany({
      where: { sessionId: session.id },
      orderBy: { position: "asc" },
    });

    expect(agendaTasks).toHaveLength(3);
    const sumMinutes = agendaTasks.reduce((s, t) => s + t.plannedMinutes, 0);
    expect(sumMinutes).toBe(90);

    const sessionInDb = await db.session.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(sessionInDb.agendaSource).not.toBeNull();
    expect(sessionInDb.agendaGeneratedAt).not.toBeNull();
  });
});
