import { describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import * as geminiClient from "@/server/services/ai/gemini-client";
import {
  aiSummaryQuizSchema,
  buildSummaryQuizPrompt,
  generateSessionSummaryAndQuiz,
  submitQuizAttempt,
} from "@/server/services/ai/summary-quiz-service";
import { acceptSessionRequest, requestSession } from "@/server/services/sessions/booking-service";
import { recordSessionAttendance } from "@/server/services/sessions/cancellation-service";
import { getSessionRoomData } from "@/server/services/sessions/room-service";

describe("AI Summary & Quiz Generation (Module 8: FR-8.1, FR-8.6)", () => {
  async function createFixture() {
    const unique = Math.random().toString(36).substring(2, 9);

    const category = await db.skillCategory.create({
      data: {
        slug: `cat-quiz-${unique}`,
        nameAr: `تصنيف ذكاء-${unique}`,
        nameEn: `Category AI-${unique}`,
      },
    });

    const skill = await db.skill.create({
      data: {
        categoryId: category.id,
        slug: `skill-quiz-${unique}`,
        nameAr: `بايثون متقدم-${unique}`,
        nameEn: `Advanced Python-${unique}`,
      },
    });

    const learner = await db.user.create({
      data: {
        email: `learner-quiz-${unique}@chronoswap.test`,
        passwordHash: "hash123",
        displayName: `أحمد المتعلم-${unique}`,
        timezone: "Asia/Damascus",
        wallet: {
          create: {
            availableMinutes: 300,
            frozenMinutes: 0,
            debtMinutes: 0,
          },
        },
      },
      include: { wallet: true },
    });

    const teacher = await db.user.create({
      data: {
        email: `teacher-quiz-${unique}@chronoswap.test`,
        passwordHash: "hash123",
        displayName: `سارة المدرّسة-${unique}`,
        timezone: "Asia/Damascus",
        wallet: {
          create: {
            availableMinutes: 60,
            frozenMinutes: 0,
            debtMinutes: 0,
          },
        },
      },
      include: { wallet: true },
    });

    await db.userSkill.create({
      data: {
        userId: teacher.id,
        skillId: skill.id,
        kind: "OFFERED",
      },
    });

    await db.availabilitySlot.createMany({
      data: [
        { userId: teacher.id, weekday: 0, startMinute: 0, endMinute: 1440, timezone: "UTC" },
        { userId: teacher.id, weekday: 1, startMinute: 0, endMinute: 1440, timezone: "UTC" },
        { userId: teacher.id, weekday: 2, startMinute: 0, endMinute: 1440, timezone: "UTC" },
        { userId: teacher.id, weekday: 3, startMinute: 0, endMinute: 1440, timezone: "UTC" },
        { userId: teacher.id, weekday: 4, startMinute: 0, endMinute: 1440, timezone: "UTC" },
        { userId: teacher.id, weekday: 5, startMinute: 0, endMinute: 1440, timezone: "UTC" },
        { userId: teacher.id, weekday: 6, startMinute: 0, endMinute: 1440, timezone: "UTC" },
      ],
    });

    const startAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const session = await requestSession(learner.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      durationMinutes: 60,
      startAt,
      goal: "إتقان AsyncIO و Decorators في بايثون",
    });

    await acceptSessionRequest(teacher.id, { sessionId: session.id });
    await recordSessionAttendance(teacher.id, session.id, "JOIN");
    await recordSessionAttendance(learner.id, session.id, "JOIN");

    // Add workspace notes & code
    await db.sessionWorkspace.create({
      data: {
        sessionId: session.id,
        notes: "شرحنا مفهوم Event Loop واستخدام async/await مع أمثلة عملية",
        code: "import asyncio\nasync def main():\n    print('Hello')",
        codeLanguage: "python",
      },
    });

    // Mark tasks done
    await db.agendaTask.updateMany({
      where: { sessionId: session.id },
      data: { isDone: true, doneAt: new Date() },
    });

    // Transition session to ENDED
    await db.session.update({
      where: { id: session.id },
      data: {
        status: "ENDED",
        endedAt: new Date(),
        releaseDueAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
        completionPercent: 100,
      },
    });

    return { learner, teacher, skill, category, session };
  }

  // ─────────────────────────────────────────────────────────────
  // Unit & Schema checks
  // ─────────────────────────────────────────────────────────────

  it("FR-8.6: strict privacy enforcement in prompt builder (no personal data)", () => {
    const prompt = buildSummaryQuizPrompt({
      skillName: "بايثون",
      categoryName: "برمجة",
      goal: "تعلم الدوال",
      tickedTasks: ["دوال مخصصة", "تطبيق عملي"],
      notes: "ملاحظات تعليمية فقط",
      code: "def hello(): pass",
    });

    expect(prompt).toContain("بايثون");
    expect(prompt).toContain("تعلم الدوال");
    expect(prompt).toContain("دوال مخصصة");
    expect(prompt).toContain("def hello(): pass");

    // Must NOT contain personal identifiers
    expect(prompt).not.toContain("أحمد");
    expect(prompt).not.toContain("سارة");
    expect(prompt).not.toContain("@chronoswap");
  });

  it("FR-8.1: aiSummaryQuizSchema validates exactly 3 questions", () => {
    const validData = {
      summary: "ملخص شامل للجلسة التعليمية حول بايثون",
      keyPoints: ["المفهوم الأول", "المفهوم الثاني"],
      exercises: [{ title: "تطبيق عملي", description: "اكتب كوداً يستخدم async/await" }],
      questions: [
        {
          prompt: "ما وظيفة async في بايثون؟",
          options: ["تعريف دالة غير متزامنة", "حلقة تكرار", "معالجة أخطاء"],
          correctOption: 0,
          explanation: "تحدد الدالة كـ Coroutine",
        },
        {
          prompt: "أي مكتبة تُستخدم مع Event Loop؟",
          options: ["math", "asyncio", "sys"],
          correctOption: 1,
        },
        {
          prompt: "ما الكلمة المفتاحية لانتظار دالة؟",
          options: ["wait", "yield", "await"],
          correctOption: 2,
        },
      ],
    };

    const parsed = aiSummaryQuizSchema.safeParse(validData);
    expect(parsed.success).toBe(true);

    // Reject if questions length is 2 or 4 (must be exactly 3 per QUIZ_QUESTION_COUNT)
    const invalidData = {
      ...validData,
      questions: validData.questions.slice(0, 2),
    };
    const invalidParsed = aiSummaryQuizSchema.safeParse(invalidData);
    expect(invalidParsed.success).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────
  // Service Execution Tests (with Gemini mock)
  // ─────────────────────────────────────────────────────────────

  it("FR-8.1: generates summary, 3-question quiz, and advances session to QUIZ_PENDING", async () => {
    const fixture = await createFixture();

    const mockAiResponse = JSON.stringify({
      summary: "تم في هذه الجلسة مراجعة مفاهيم البرمجة غير المتزامنة وكتابة Coroutines عملية.",
      keyPoints: ["فهم حلقة الأحداث Event Loop", "استخدام async و await", "إنشاء مهام متوازية"],
      exercises: [
        {
          title: "محاكي تنزيل ملفات",
          description: "قم بإنشاء برنامج يقوم بمحاكاة تنزيل 3 ملفات بشكل غير متزامن.",
        },
      ],
      questions: [
        {
          prompt: "ما هو الـ Coroutine في بايثون؟",
          options: ["دالة خاصة تُدار بواسطة حلقة الأحداث", "متغير نصي", "كائن ثابت"],
          correctOption: 0,
          explanation: "الدوال المعرفة بـ async def هي coroutines",
        },
        {
          prompt: "ماذا تعيد asyncio.gather؟",
          options: ["قائمة نتائج", "خطأ", "قيمة منطقية"],
          correctOption: 0,
        },
        {
          prompt: "ما الهدف الأساسي من البرمجة غير المتزامنة؟",
          options: ["عدم تعطيل التنفيذ أثناء عمليات I/O", "تسريع العمليات الحسابية", "ضغط الملفات"],
          correctOption: 0,
        },
      ],
    });

    const callGeminiSpy = vi
      .spyOn(geminiClient, "callGemini")
      .mockResolvedValueOnce(mockAiResponse);

    const result = await generateSessionSummaryAndQuiz(fixture.session.id);

    expect(result.success).toBe(true);
    expect(result.status).toBe("GENERATED");
    expect(result.summaryId).toBeDefined();
    expect(result.quizId).toBeDefined();

    // Verify AiSummary record in DB
    const savedSummary = await db.aiSummary.findUniqueOrThrow({
      where: { sessionId: fixture.session.id },
    });
    expect(savedSummary.status).toBe("SUCCEEDED");
    expect(savedSummary.summary).toContain("البرمجة غير المتزامنة");
    expect(Array.isArray(savedSummary.keyPoints)).toBe(true);
    expect(Array.isArray(savedSummary.exercises)).toBe(true);

    // Verify Quiz & QuizQuestions in DB (exactly 3 questions)
    const savedQuiz = await db.quiz.findUniqueOrThrow({
      where: { sessionId: fixture.session.id },
      include: { questions: { orderBy: { position: "asc" } } },
    });
    expect(savedQuiz.questions.length).toBe(3);
    expect(savedQuiz.questions[0].prompt).toContain("Coroutine");
    expect(savedQuiz.questions[0].position).toBe(0);
    expect(savedQuiz.questions[1].position).toBe(1);
    expect(savedQuiz.questions[2].position).toBe(2);

    // Verify session state machine transition: ENDED -> QUIZ_PENDING
    const updatedSession = await db.session.findUniqueOrThrow({
      where: { id: fixture.session.id },
      include: { events: true },
    });
    expect(updatedSession.status).toBe("QUIZ_PENDING");

    const event = updatedSession.events.find((e) => e.trigger === "FR-8.1:quiz-ready");
    expect(event).toBeDefined();
    expect(event?.toStatus).toBe("QUIZ_PENDING");

    // Second call should return ALREADY_EXISTS
    const secondCall = await generateSessionSummaryAndQuiz(fixture.session.id);
    expect(secondCall.status).toBe("ALREADY_EXISTS");

    callGeminiSpy.mockRestore();
  });

  it("FR-8.5: gracefully falls back when Gemini API fails or times out", async () => {
    const fixture = await createFixture();

    // Simulate Gemini failure (returns null per NFR-5 / fallback)
    const callGeminiSpy = vi
      .spyOn(geminiClient, "callGemini")
      .mockResolvedValueOnce(null);

    const result = await generateSessionSummaryAndQuiz(fixture.session.id);

    expect(result.success).toBe(false);
    expect(result.status).toBe("FALLBACK_NOOP");

    // Session remains in ENDED state (no crash, ready for 48h auto-release)
    const session = await db.session.findUniqueOrThrow({
      where: { id: fixture.session.id },
    });
    expect(session.status).toBe("ENDED");

    // AiSummary status recorded as FAILED
    const summary = await db.aiSummary.findUniqueOrThrow({
      where: { sessionId: fixture.session.id },
    });
    expect(summary.status).toBe("FAILED");

    callGeminiSpy.mockRestore();
  });

  it("FR-8.2: preserves summary and exercises in the learner's archive alongside notes and code", async () => {
    const fixture = await createFixture();

    const mockAiResponse = JSON.stringify({
      summary: "ملخص محفوظ للأبد في أرشيف المتعلم",
      keyPoints: ["نقطة 1", "نقطة 2"],
      exercises: [{ title: "تطبيق ذاتي", description: "قم بحل التمرين التالي" }],
      questions: [
        { prompt: "سؤال 1", options: ["أ", "ب", "ج"], correctOption: 0 },
        { prompt: "سؤال 2", options: ["أ", "ب", "ج"], correctOption: 1 },
        { prompt: "سؤال 3", options: ["أ", "ب", "ج"], correctOption: 2 },
      ],
    });

    const callGeminiSpy = vi
      .spyOn(geminiClient, "callGemini")
      .mockResolvedValueOnce(mockAiResponse);

    await generateSessionSummaryAndQuiz(fixture.session.id);

    // Fetch the learner's room/archive view
    const roomData = await getSessionRoomData(fixture.session.id, fixture.learner.id);

    // Assert notes & code are preserved
    expect(roomData.workspace?.notes).toContain("Event Loop");
    expect(roomData.workspace?.code).toContain("import asyncio");

    // Assert summary and exercises are preserved in archive
    expect(roomData.aiSummary?.status).toBe("SUCCEEDED");
    expect(roomData.aiSummary?.summary).toBe("ملخص محفوظ للأبد في أرشيف المتعلم");
    expect(Array.isArray(roomData.aiSummary?.keyPoints)).toBe(true);
    expect(Array.isArray(roomData.aiSummary?.exercises)).toBe(true);
    expect(roomData.isLearner).toBe(true);

    callGeminiSpy.mockRestore();
  });

  // ─────────────────────────────────────────────────────────────
  // FR-8.3: Learner solves quiz, evaluates score, releases escrow
  // ─────────────────────────────────────────────────────────────

  async function prepareQuizPendingSession() {
    const fixture = await createFixture();

    const mockAiResponse = JSON.stringify({
      summary: "ملخص شامل للجلسة",
      keyPoints: ["نقطة 1", "نقطة 2"],
      exercises: [{ title: "تمرين 1", description: "وصف التمرين" }],
      questions: [
        {
          prompt: "ما هو Event Loop؟",
          options: ["مدير الأحداث", "محرر نصوص", "قاعدة بيانات"],
          correctOption: 0,
          explanation: "الـ Event Loop يدير تنفيذ العمليات اللاتزامنية",
        },
        {
          prompt: "ما فائدة await؟",
          options: ["إلغاء التنفيذ", "انتظار نتيجة الـ coroutine", "إعادة تشغيل النظام"],
          correctOption: 1,
          explanation: "تُستخدم await لانتظار إنجاز العملية دون تجميد الخيط",
        },
        {
          prompt: "كيف نعرّف دالة غير متزامنة؟",
          options: ["def sync()", "function()", "async def foo()"],
          correctOption: 2,
          explanation: "في بايثون الكلمة المفتاحية هي async def",
        },
      ],
    });

    const spy = vi.spyOn(geminiClient, "callGemini").mockResolvedValueOnce(mockAiResponse);
    await generateSessionSummaryAndQuiz(fixture.session.id);
    spy.mockRestore();

    return fixture;
  }

  it("FR-8.3: learner solves quiz, records attempt as evidence, and releases escrow to teacher", async () => {
    const fixture = await prepareQuizPendingSession();

    // Verify session is in QUIZ_PENDING state
    const beforeSession = await db.session.findUniqueOrThrow({
      where: { id: fixture.session.id },
      include: {
        learner: { include: { wallet: true } },
        teacher: { include: { wallet: true } },
      },
    });
    expect(beforeSession.status).toBe("QUIZ_PENDING");
    const teacherInitialAvailable = beforeSession.teacher.wallet!.availableMinutes;
    const learnerInitialFrozen = beforeSession.learner.wallet!.frozenMinutes;

    // Learner submits answers: Q0=0 (correct), Q1=1 (correct), Q2=1 (wrong, correct is 2)
    const result = await submitQuizAttempt({
      sessionId: fixture.session.id,
      learnerId: fixture.learner.id,
      answers: [0, 1, 1],
    });

    // Check result evaluation
    expect(result.correctCount).toBe(2);
    expect(result.totalCount).toBe(3);
    expect(result.percentage).toBe(67);
    expect(result.passed).toBe(true);
    expect(result.status).toBe("RELEASED");
    expect(result.questions[0].isCorrect).toBe(true);
    expect(result.questions[1].isCorrect).toBe(true);
    expect(result.questions[2].isCorrect).toBe(false);

    // Verify QuizAttempt persisted in DB (FR-8.3 evidence of learning)
    const attempt = await db.quizAttempt.findUniqueOrThrow({
      where: { id: result.attemptId },
    });
    expect(attempt.learnerId).toBe(fixture.learner.id);
    expect(attempt.correctCount).toBe(2);
    expect(attempt.totalCount).toBe(3);
    expect(attempt.answers).toEqual([0, 1, 1]);

    // Verify Session state transitioned to RELEASED
    const afterSession = await db.session.findUniqueOrThrow({
      where: { id: fixture.session.id },
      include: {
        events: true,
        learner: { include: { wallet: true } },
        teacher: { include: { wallet: true } },
      },
    });
    expect(afterSession.status).toBe("RELEASED");
    expect(afterSession.settledAt).not.toBeNull();

    // Verify SessionEvent logged
    const event = afterSession.events.find((e) => e.trigger === "FR-8.3:quiz-solved");
    expect(event).toBeDefined();
    expect(event?.fromStatus).toBe("QUIZ_PENDING");
    expect(event?.toStatus).toBe("RELEASED");
    expect(event?.actorId).toBe(fixture.learner.id);

    // Verify financial settlement (FR-2.3)
    // Teacher wallet available increased by 60
    expect(afterSession.teacher.wallet!.availableMinutes).toBe(teacherInitialAvailable + 60);
    // Learner wallet frozen decreased by 60
    expect(afterSession.learner.wallet!.frozenMinutes).toBe(learnerInitialFrozen - 60);

    // Verify ledger entries
    const ledgerEntries = await db.ledgerEntry.findMany({
      where: { sessionId: fixture.session.id },
      orderBy: { createdAt: "desc" },
    });
    const creditEntry = ledgerEntries.find((e) => e.type === "SESSION_RELEASE_CREDIT");
    const debitEntry = ledgerEntries.find((e) => e.type === "SESSION_RELEASE_DEBIT");
    expect(creditEntry).toBeDefined();
    expect(creditEntry?.availableDelta).toBe(60);
    expect(debitEntry).toBeDefined();
    expect(debitEntry?.frozenDelta).toBe(-60);
  });

  it("FR-8.3: releases escrow and repays teacher FIFO debts when quiz is solved", async () => {
    const fixture = await prepareQuizPendingSession();

    // Create an existing debt for teacher (25 minutes)
    await db.debt.create({
      data: {
        userId: fixture.teacher.id,
        sessionId: fixture.session.id,
        originalMinutes: 25,
        remainingMinutes: 25,
      },
    });
    await db.wallet.update({
      where: { userId: fixture.teacher.id },
      data: { debtMinutes: 25 },
    });

    const teacherBefore = await db.wallet.findUniqueOrThrow({
      where: { userId: fixture.teacher.id },
    });
    expect(teacherBefore.debtMinutes).toBe(25);

    // Learner solves quiz: 3 out of 3 correct
    const result = await submitQuizAttempt({
      sessionId: fixture.session.id,
      learnerId: fixture.learner.id,
      answers: [0, 1, 2],
    });

    expect(result.correctCount).toBe(3);
    expect(result.status).toBe("RELEASED");

    // Teacher received 60 minutes: 25 repaid FIFO debt, 35 added to available
    const teacherAfter = await db.wallet.findUniqueOrThrow({
      where: { userId: fixture.teacher.id },
    });
    expect(teacherAfter.debtMinutes).toBe(0);
    expect(teacherAfter.availableMinutes).toBe(teacherBefore.availableMinutes + 35);

    // Verify debt is marked settled
    const debt = await db.debt.findFirstOrThrow({
      where: { userId: fixture.teacher.id, sessionId: fixture.session.id },
    });
    expect(debt.remainingMinutes).toBe(0);
    expect(debt.settledAt).not.toBeNull();
  });

  it("FR-8.3: rejects quiz submission by teacher or unauthorized third-party (FORBIDDEN)", async () => {
    const fixture = await prepareQuizPendingSession();

    // Attempt submission by teacher -> throws FORBIDDEN
    await expect(
      submitQuizAttempt({
        sessionId: fixture.session.id,
        learnerId: fixture.teacher.id,
        answers: [0, 1, 2],
      }),
    ).rejects.toThrow(DomainError);

    // Attempt submission by a random third party
    const stranger = await db.user.create({
      data: {
        email: `stranger-${Math.random().toString(36).substring(2, 8)}@test.com`,
        passwordHash: "hash123",
        displayName: "مستخدم غريب",
      },
    });

    await expect(
      submitQuizAttempt({
        sessionId: fixture.session.id,
        learnerId: stranger.id,
        answers: [0, 1, 2],
      }),
    ).rejects.toThrow(DomainError);
  });

  it("FR-8.3: rejects duplicate quiz submission (ALREADY_SUBMITTED)", async () => {
    const fixture = await prepareQuizPendingSession();

    // First attempt succeeds
    await submitQuizAttempt({
      sessionId: fixture.session.id,
      learnerId: fixture.learner.id,
      answers: [0, 1, 2],
    });

    // Second attempt fails with ALREADY_SUBMITTED
    await expect(
      submitQuizAttempt({
        sessionId: fixture.session.id,
        learnerId: fixture.learner.id,
        answers: [0, 1, 2],
      }),
    ).rejects.toThrow(DomainError);
  });

  it("FR-8.3: transitions barter session to BARTER_COMPLETED on quiz submission", async () => {
    const fixture = await createFixture();

    const cycle = await db.barterCycle.create({
      data: {
        status: "ACTIVE",
        durationMinutes: 60,
        respondByAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Set session kind to BARTER, escrowMinutes to 0, and link barterCycleId
    await db.session.update({
      where: { id: fixture.session.id },
      data: {
        kind: "BARTER",
        escrowMinutes: 0,
        barterCycleId: cycle.id,
      },
    });

    // Generate quiz
    const mockAiResponse = JSON.stringify({
      summary: "ملخص مقايضة",
      keyPoints: ["نقطة 1", "نقطة 2"],
      exercises: [{ title: "تمرين", description: "تفاصيل" }],
      questions: [
        { prompt: "سؤال 1", options: ["أ", "ب"], correctOption: 0 },
        { prompt: "سؤال 2", options: ["أ", "ب"], correctOption: 1 },
        { prompt: "سؤال 3", options: ["أ", "ب"], correctOption: 0 },
      ],
    });
    const spy = vi.spyOn(geminiClient, "callGemini").mockResolvedValueOnce(mockAiResponse);
    await generateSessionSummaryAndQuiz(fixture.session.id);
    spy.mockRestore();

    // Submit quiz
    const result = await submitQuizAttempt({
      sessionId: fixture.session.id,
      learnerId: fixture.learner.id,
      answers: [0, 1, 0],
    });

    expect(result.status).toBe("BARTER_COMPLETED");
    expect(result.correctCount).toBe(3);

    const updatedSession = await db.session.findUniqueOrThrow({
      where: { id: fixture.session.id },
      include: { events: true },
    });
    expect(updatedSession.status).toBe("BARTER_COMPLETED");
    const event = updatedSession.events.find((e) => e.trigger === "FR-8.3:quiz-solved");
    expect(event).toBeDefined();
    expect(event?.toStatus).toBe("BARTER_COMPLETED");
  });
});

