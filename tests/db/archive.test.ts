import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getLearningArchive } from "@/server/services/sessions/archive-service";

afterAll(() => db.$disconnect());

async function makeUser(label: string) {
  return db.user.create({
    data: {
      email: `archive-${label}-${randomUUID()}@chronoswap.test`,
      passwordHash: "hash",
      displayName: `مستخدم ${label}`,
      emailVerifiedAt: new Date(),
      wallet: { create: {} },
    },
  });
}

describe("Learning archive (FR-5.5, FR-8.2)", () => {
  it("keeps finished sessions with notes, code, summary and quiz, only for their learner", async () => {
    const unique = randomUUID();
    const category = await db.skillCategory.create({
      data: { slug: `ar-cat-${unique}`, nameAr: `تصنيف ${unique.slice(0, 6)}` },
    });
    const skill = await db.skill.create({
      data: { categoryId: category.id, slug: `ar-${unique}`, nameAr: "بايثون" },
    });
    const learner = await makeUser("learner");
    const teacher = await makeUser("teacher");
    const startAt = new Date(Date.now() - 3 * 24 * 60 * 60_000);

    const finished = await db.session.create({
      data: {
        kind: "DIRECT",
        status: "RELEASED",
        learnerId: learner.id,
        teacherId: teacher.id,
        skillId: skill.id,
        durationMinutes: 60,
        escrowMinutes: 60,
        goal: "فهم الحلقات",
        startAt,
        endAt: new Date(startAt.getTime() + 60 * 60_000),
        workspace: { create: { notes: "for و while", code: "for i in range(3): print(i)", codeLanguage: "python" } },
        aiSummary: {
          create: {
            status: "SUCCEEDED",
            summary: "ملخص الجلسة",
            keyPoints: ["النقطة 1"],
            exercises: [{ title: "تمرين", description: "اطبع الأعداد" }],
          },
        },
        agendaTasks: {
          create: [
            { position: 0, title: "نظري", plannedMinutes: 15, isDone: true, doneAt: startAt },
            { position: 1, title: "تطبيقي", plannedMinutes: 30, isDone: false },
          ],
        },
      },
    });
    const quiz = await db.quiz.create({ data: { sessionId: finished.id } });
    await db.quizAttempt.create({
      data: { quizId: quiz.id, learnerId: learner.id, answers: [0, 1, 2], correctCount: 2, totalCount: 3 },
    });

    // Not archived: never took place.
    await db.session.create({
      data: {
        kind: "DIRECT",
        status: "CANCELLED",
        learnerId: learner.id,
        teacherId: teacher.id,
        skillId: skill.id,
        durationMinutes: 60,
        escrowMinutes: 60,
        goal: "ألغيت",
        startAt: new Date(startAt.getTime() + 2 * 60 * 60_000),
        endAt: new Date(startAt.getTime() + 3 * 60 * 60_000),
      },
    });

    const archive = await getLearningArchive(learner.id);
    expect(archive).toHaveLength(1);
    const [entry] = archive;
    expect(entry.sessionId).toBe(finished.id);
    expect(entry.code).toContain("range(3)");
    expect(entry.summary).toEqual({
      text: "ملخص الجلسة",
      keyPoints: ["النقطة 1"],
      exercises: [{ title: "تمرين", description: "اطبع الأعداد" }],
    });
    expect(entry.quiz).toEqual({ correctCount: 2, totalCount: 3 });
    expect(entry.ticked).toEqual({ done: 1, total: 2 });

    // The teacher's archive does not contain sessions they taught.
    expect(await getLearningArchive(teacher.id)).toHaveLength(0);
  });
});
