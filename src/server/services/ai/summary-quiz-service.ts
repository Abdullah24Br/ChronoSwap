import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { QUIZ_QUESTION_COUNT } from "@/lib/rules";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import { withWalletTransaction } from "@/server/services/wallet/ledger";
import { releaseSessionEscrow } from "@/server/services/wallet/wallet-service";
import { requestSummaryQuiz, type SummaryQuizRequest } from "./ai-service-client";

// ─────────────────────────────────────────────────────────────
// FR-8.1 / FR-8.6: Types & Zod Schemas
// ─────────────────────────────────────────────────────────────

const aiSummaryPartShape = {
  summary: z.string().trim().min(10),
  keyPoints: z.array(z.string().trim()).min(2).max(8),
  exercises: z.array(
    z.object({
      title: z.string().trim().min(2),
      description: z.string().trim().min(5),
    }),
  ).min(1).max(5),
};

/** Q-21: the summary part alone (kept when the quiz could not be made). */
export const aiSummaryPartSchema = z.object(aiSummaryPartShape);

export const aiSummaryQuizSchema = z.object({
  ...aiSummaryPartShape,
  questions: z.array(
    z.object({
      prompt: z.string().trim().min(5),
      options: z.array(z.string().trim()).min(2).max(6),
      correctOption: z.number().int().min(0).max(5),
      explanation: z.string().trim().optional(),
    }),
  ).length(QUIZ_QUESTION_COUNT),
});

export type AiSummaryQuizOutput = z.infer<typeof aiSummaryQuizSchema>;

// ─────────────────────────────────────────────────────────────
// Request builder (FR-8.1 & FR-8.6): only educational content + names to be removed
// ─────────────────────────────────────────────────────────────

/**
 * FR-8.6 / Q-22: the payload for the Python summary graph. Only educational content goes in the
 * content fields; participant names travel separately so the graph's first node can strip them
 * from the goal, notes and code before anything reaches Gemini. No e-mails or ids are sent.
 */
export function buildSummaryQuizInput(opts: {
  skillName: string;
  categoryName?: string;
  goal: string;
  tickedTasks: string[];
  notes?: string;
  code?: string;
  participantNames?: string[];
}): SummaryQuizRequest {
  return {
    skill: opts.skillName,
    category: opts.categoryName ?? "",
    goal: opts.goal,
    tickedTasks: opts.tickedTasks,
    notes: (opts.notes ?? "").slice(0, 20000),
    code: (opts.code ?? "").slice(0, 20000),
    participantNames: opts.participantNames ?? [],
  };
}

// ─────────────────────────────────────────────────────────────
// Service Function: Generate & Save Summary + Quiz (FR-8.1)
// ─────────────────────────────────────────────────────────────

export interface GenerateSummaryQuizResult {
  success: boolean;
  status: "GENERATED" | "FALLBACK_NOOP" | "ALREADY_EXISTS";
  summaryId?: string;
  quizId?: string;
  error?: string;
}

/**
 * FR-8.1 / FR-8.2 / FR-8.5 / FR-8.6:
 * Generates an AI summary and 3-question multiple-choice quiz for an ENDED session.
 * - Extracts only educational context (FR-8.6 privacy).
 * - Calls Gemini API with 30s timeout (NFR-5).
 * - On success: saves AiSummary and Quiz + QuizQuestions, transitions session to QUIZ_PENDING.
 * - On failure/timeout: records FAILED status, leaves session as ENDED for safe 48h fallback (FR-8.5).
 */
export async function generateSessionSummaryAndQuiz(
  sessionId: string,
  client: PrismaClient = db,
  now: Date = new Date(),
): Promise<GenerateSummaryQuizResult> {
  const session = await client.session.findUnique({
    where: { id: sessionId },
    include: {
      skill: { include: { category: true } },
      agendaTasks: { orderBy: { position: "asc" } },
      workspace: true,
      aiSummary: true,
      quiz: true,
      teacher: { select: { displayName: true } },
      learner: { select: { displayName: true } },
    },
  });

  if (!session) {
    throw new DomainError("NOT_FOUND", "الجلسة غير موجودة");
  }

  // If already generated successfully, return existing
  if (session.aiSummary?.status === "SUCCEEDED" && session.quiz) {
    return {
      success: true,
      status: "ALREADY_EXISTS",
      summaryId: session.aiSummary.id,
      quizId: session.quiz.id,
    };
  }

  // Extract strictly educational data (FR-8.6: No personal names/emails)
  const tickedTasks = session.agendaTasks
    .filter((t) => t.isDone)
    .map((t) => `${t.title}${t.details ? `: ${t.details}` : ""}`);

  const input = buildSummaryQuizInput({
    skillName: session.skill.nameAr,
    categoryName: session.skill.category?.nameAr,
    goal: session.goal,
    tickedTasks,
    notes: session.workspace?.notes,
    code: session.workspace?.code,
    participantNames: [session.teacher.displayName, session.learner.displayName],
  });

  // Python LangGraph service (NFR-5: 30 s cap on this side, the graph stops earlier)
  const result = await requestSummaryQuiz(input);

  if (!result || result.status === "FAILED") {
    // FR-8.5 Fallback: Mark AI summary as FAILED, session remains in ENDED
    await client.aiSummary.upsert({
      where: { sessionId },
      create: {
        sessionId,
        status: "FAILED",
        errorMessage: "تعذر الحصول على استجابة من الذكاء الاصطناعي ضمن المهلة المحددة",
      },
      update: {
        status: "FAILED",
        errorMessage: "تعذر الحصول على استجابة من الذكاء الاصطناعي ضمن المهلة المحددة",
      },
    });

    return {
      success: false,
      status: "FALLBACK_NOOP",
      error: "لم يستجب الذكاء الاصطناعي، تم اعتماد خطة البديل الآمن (FR-8.5)",
    };
  }

  // Q-21: the graph kept a valid summary but could not produce a valid quiz. Save the summary
  // (FR-8.2) and leave the session ENDED: no quiz, release after 48h (FR-8.5).
  if (result.status === "PARTIAL") {
    const part = aiSummaryPartSchema.safeParse(result);
    if (part.success) {
      await client.aiSummary.upsert({
        where: { sessionId },
        create: {
          sessionId,
          status: "SUCCEEDED",
          summary: part.data.summary,
          keyPoints: part.data.keyPoints,
          exercises: part.data.exercises,
          model: result.model,
          completedAt: now,
          errorMessage: "تعذّر توليد اختبار صالح، فحُفظ الملخص دون اختبار (Q-21)",
        },
        update: {
          status: "SUCCEEDED",
          summary: part.data.summary,
          keyPoints: part.data.keyPoints,
          exercises: part.data.exercises,
          model: result.model,
          completedAt: now,
          errorMessage: "تعذّر توليد اختبار صالح، فحُفظ الملخص دون اختبار (Q-21)",
        },
      });
      return { success: false, status: "FALLBACK_NOOP", error: "حُفظ الملخص دون اختبار (FR-8.5 / Q-21)" };
    }
  }

  // Validate again with Zod before saving (defence in depth)
  let parsed: AiSummaryQuizOutput;
  try {
    parsed = aiSummaryQuizSchema.parse(result);
  } catch (err: unknown) {
    await client.aiSummary.upsert({
      where: { sessionId },
      create: {
        sessionId,
        status: "FAILED",
        errorMessage: `استجابة غير متوافقة من الذكاء الاصطناعي: ${err instanceof Error ? err.message : "Parse Error"}`,
      },
      update: {
        status: "FAILED",
        errorMessage: `استجابة غير متوافقة من الذكاء الاصطناعي: ${err instanceof Error ? err.message : "Parse Error"}`,
      },
    });

    return {
      success: false,
      status: "FALLBACK_NOOP",
      error: "صيغة غير متوافقة من الذكاء الاصطناعي (FR-8.5)",
    };
  }

  // Atomically persist AiSummary, Quiz, QuizQuestions, and advance session status to QUIZ_PENDING
  return withWalletTransaction(client, async (tx) => {
    // 1. Create or update AiSummary (FR-8.2)
    const summary = await tx.aiSummary.upsert({
      where: { sessionId },
      create: {
        sessionId,
        status: "SUCCEEDED",
        summary: parsed.summary,
        keyPoints: parsed.keyPoints,
        exercises: parsed.exercises,
        model: result.model,
        completedAt: now,
      },
      update: {
        status: "SUCCEEDED",
        summary: parsed.summary,
        keyPoints: parsed.keyPoints,
        exercises: parsed.exercises,
        model: result.model,
        completedAt: now,
        errorMessage: null,
      },
    });

    // 2. Create Quiz and QuizQuestions (FR-8.1)
    let quiz = await tx.quiz.findUnique({ where: { sessionId } });
    if (!quiz) {
      quiz = await tx.quiz.create({
        data: {
          sessionId,
          questions: {
            create: parsed.questions.map((q, idx) => ({
              position: idx,
              prompt: q.prompt,
              options: q.options,
              correctOption: q.correctOption,
              explanation: q.explanation || null,
            })),
          },
        },
      });
    }

    // 3. Transition session status from ENDED to QUIZ_PENDING (CAS)
    const updateRes = await tx.session.updateMany({
      where: {
        id: sessionId,
        status: "ENDED",
      },
      data: {
        status: "QUIZ_PENDING",
      },
    });

    if (updateRes.count > 0) {
      await tx.sessionEvent.create({
        data: {
          sessionId,
          fromStatus: "ENDED",
          toStatus: "QUIZ_PENDING",
          trigger: "FR-8.1:quiz-ready",
          note: "تم توليد الملخص الذكي والاختبار القصير بنجاح عبر Gemini API",
        },
      });
    }

    return {
      success: true,
      status: "GENERATED",
      summaryId: summary.id,
      quizId: quiz.id,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// FR-8.3: Submit Quiz Attempt & Release Hours to Teacher
// ─────────────────────────────────────────────────────────────

export interface SubmitQuizInput {
  sessionId: string;
  learnerId: string;
  answers: number[]; // chosen option index per question position
}

export interface SubmitQuizResult {
  attemptId: string;
  correctCount: number;
  totalCount: number;
  percentage: number;
  passed: boolean;
  status: "RELEASED" | "BARTER_COMPLETED";
  questions: Array<{
    position: number;
    prompt: string;
    options: string[];
    chosenOption: number;
    correctOption: number;
    isCorrect: boolean;
    explanation: string | null;
  }>;
}

/**
 * FR-8.3: Learner submits quiz answers.
 * - Records QuizAttempt with score (correctCount / totalCount).
 * - Transitions session:
 *     DIRECT: QUIZ_PENDING -> RELEASED with trigger "FR-8.3:quiz-solved" and releases escrow to teacher (FR-2.3).
 *     BARTER: QUIZ_PENDING -> BARTER_COMPLETED with trigger "FR-8.3:quiz-solved".
 * - Returns detailed results with correct answers and explanations.
 */
export async function submitQuizAttempt(
  input: SubmitQuizInput,
  client: PrismaClient = db,
  now: Date = new Date(),
): Promise<SubmitQuizResult> {
  const { sessionId, learnerId, answers } = input;

  return withWalletTransaction(client, async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      include: {
        quiz: {
          include: {
            questions: { orderBy: { position: "asc" } },
            attempt: true,
          },
        },
      },
    });

    if (!session) {
      throw new DomainError("NOT_FOUND", "الجلسة غير موجودة");
    }

    if (session.learnerId !== learnerId) {
      throw new DomainError("FORBIDDEN", "فقط المتعلم يمكنه حل اختبار هذه الجلسة");
    }

    if (session.status !== "QUIZ_PENDING") {
      throw new DomainError(
        "INVALID_STATUS",
        "لا يمكن تقديم الاختبار لأن الجلسة ليست في مرحلة انتظار حل الاختبار",
      );
    }

    const quiz = session.quiz;
    if (!quiz || quiz.questions.length === 0) {
      throw new DomainError("QUIZ_NOT_FOUND", "الاختبار غير موجود لهذه الجلسة");
    }

    if (quiz.attempt) {
      throw new DomainError("ALREADY_SUBMITTED", "تم تقديم هذا الاختبار مسبقاً");
    }

    if (answers.length !== quiz.questions.length) {
      throw new DomainError(
        "INVALID_ANSWERS_COUNT",
        `عدد الإجابات المرسلة (${answers.length}) لا يطابق عدد أسئلة الاختبار (${quiz.questions.length})`,
      );
    }

    // Evaluate answers
    let correctCount = 0;
    const questionsResult = quiz.questions.map((q) => {
      const chosen = answers[q.position];
      const options = q.options as string[];

      if (chosen === undefined || chosen < 0 || chosen >= options.length) {
        throw new DomainError(
          "INVALID_OPTION",
          `الخيار المحدد للسؤال ${q.position + 1} غير صالح`,
        );
      }

      const isCorrect = chosen === q.correctOption;
      if (isCorrect) correctCount += 1;

      return {
        position: q.position,
        prompt: q.prompt,
        options,
        chosenOption: chosen,
        correctOption: q.correctOption,
        isCorrect,
        explanation: q.explanation,
      };
    });

    const totalCount = quiz.questions.length;
    const percentage = Math.round((correctCount / totalCount) * 100);

    // Save QuizAttempt (FR-8.3)
    const attempt = await tx.quizAttempt.create({
      data: {
        quizId: quiz.id,
        learnerId,
        answers,
        correctCount,
        totalCount,
        submittedAt: now,
      },
    });

    let newStatus: "RELEASED" | "BARTER_COMPLETED";

    if (session.kind === "DIRECT") {
      newStatus = "RELEASED";
      // Transition QUIZ_PENDING -> RELEASED (CAS)
      const res = await tx.session.updateMany({
        where: { id: session.id, status: "QUIZ_PENDING" },
        data: {
          status: "RELEASED",
          settledAt: now,
        },
      });

      if (res.count === 0) {
        throw new DomainError("CONFLICT", "تغيرت حالة الجلسة مسبقاً");
      }

      // Release escrow to teacher and repay teacher debts FIFO first (FR-2.3)
      await releaseSessionEscrow(tx, {
        learnerId: session.learnerId,
        teacherId: session.teacherId,
        sessionId: session.id,
        durationMinutes: session.durationMinutes,
        actorId: learnerId,
        memo: `FR-8.3: تحرير الرصيد للمدرّس لاجتياز المتعلم للاختبار بنتيجة ${correctCount}/${totalCount}`,
      });

      await tx.sessionEvent.create({
        data: {
          sessionId: session.id,
          fromStatus: "QUIZ_PENDING",
          toStatus: "RELEASED",
          trigger: "FR-8.3:quiz-solved",
          actorId: learnerId,
          note: `حل الاختبار بنتيجة ${correctCount}/${totalCount} (${percentage}%) وتحرير الرصيد للمدرّس`,
        },
      });
    } else {
      newStatus = "BARTER_COMPLETED";
      // Transition QUIZ_PENDING -> BARTER_COMPLETED (CAS)
      const res = await tx.session.updateMany({
        where: { id: session.id, status: "QUIZ_PENDING" },
        data: {
          status: "BARTER_COMPLETED",
          settledAt: now,
        },
      });

      if (res.count === 0) {
        throw new DomainError("CONFLICT", "تغيرت حالة الجلسة مسبقاً");
      }

      await tx.sessionEvent.create({
        data: {
          sessionId: session.id,
          fromStatus: "QUIZ_PENDING",
          toStatus: "BARTER_COMPLETED",
          trigger: "FR-8.3:quiz-solved",
          actorId: learnerId,
          note: `حل الاختبار بنتيجة ${correctCount}/${totalCount} (${percentage}%) واكتمال جلسة المقايضة`,
        },
      });
    }

    return {
      attemptId: attempt.id,
      correctCount,
      totalCount,
      percentage,
      passed: correctCount > 0,
      status: newStatus,
      questions: questionsResult,
    };
  });
}

