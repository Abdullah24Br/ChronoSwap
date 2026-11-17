import { z } from "zod";
import type { AgendaPhase, PrismaClient } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import { requestAgenda } from "./ai-service-client";

// ─────────────────────────────────────────────────────────────
// Types & Schemas
// ─────────────────────────────────────────────────────────────

export interface RawAgendaItem {
  title: string;
  details?: string;
  phase: AgendaPhase;
  plannedMinutes: number;
}

const aiAgendaSchema = z.array(
  z.object({
    title: z.string().trim().min(3).max(200),
    details: z.string().trim().max(1000).optional(),
    phase: z.enum(["THEORY", "PRACTICE", "REVIEW"]),
    plannedMinutes: z.number().int().positive(),
  }),
).min(2).max(8);

// ─────────────────────────────────────────────────────────────
// Fallback Agenda Generator (FR-4.4)
// ─────────────────────────────────────────────────────────────

/**
 * FR-4.4: Computes exact integer minute distribution for fallback agenda:
 * - 25% Theory
 * - 50% Practice
 * - 25% Review
 * The sum is mathematically guaranteed to equal durationMinutes exactly.
 */
export function calculateFallbackPhases(durationMinutes: number): {
  theoryMinutes: number;
  practiceMinutes: number;
  reviewMinutes: number;
} {
  const theoryMinutes = Math.round(durationMinutes * 0.25);
  const practiceMinutes = Math.round(durationMinutes * 0.5);
  const reviewMinutes = durationMinutes - theoryMinutes - practiceMinutes;

  return {
    theoryMinutes,
    practiceMinutes,
    reviewMinutes,
  };
}

/**
 * FR-4.4: Generates default 3-phase fallback agenda tasks.
 */
export function generateFallbackAgenda(opts: {
  durationMinutes: number;
  skillNameAr: string;
  goal: string;
}): RawAgendaItem[] {
  const { theoryMinutes, practiceMinutes, reviewMinutes } =
    calculateFallbackPhases(opts.durationMinutes);

  return [
    {
      title: `المفاهيم والأسس النظرية: ${opts.skillNameAr}`,
      details: `استعراض المفاهيم والمبادئ الأساسية المتعلقة بالهدف التعليمي: ${opts.goal}`,
      phase: "THEORY",
      plannedMinutes: theoryMinutes,
    },
    {
      title: "التطبيق العملي والتدريب التفاعلي المباشر",
      details: "تطبيق خطوة بخطوة مع حل أمثلة عملية وكتابة الأكواد ومراجعتها مع المدرّس",
      phase: "PRACTICE",
      plannedMinutes: practiceMinutes,
    },
    {
      title: "المراجعة الشاملة، الإجابة عن الأسئلة، والتقييم",
      details: "مراجعة مخرجات الجلسة، حل أي صعوبات أو استفسارات، وتلخيص ما تم إنجازه",
      phase: "REVIEW",
      plannedMinutes: reviewMinutes,
    },
  ];
}

// ─────────────────────────────────────────────────────────────
// AI Agenda Generator via Gemini (FR-4.3)
// ─────────────────────────────────────────────────────────────

/**
 * FR-4.3 / FR-8.6: asks the Python AI service (LangGraph agenda graph: scrub → generate →
 * validate → repair → fallback) for an agenda. The graph already validates and repairs; this side
 * validates again before anything is saved (defence in depth) and returns null when the service
 * is unreachable or fell back, so FR-4.4 applies.
 */
export async function generateAiAgenda(opts: {
  durationMinutes: number;
  skillNameAr: string;
  categoryNameAr?: string;
  goal: string;
  /** Removed by the service before the prompt is built (FR-8.6 / Q-22). */
  participantNames?: string[];
}): Promise<RawAgendaItem[] | null> {
  const result = await requestAgenda({
    durationMinutes: opts.durationMinutes,
    skill: opts.skillNameAr,
    category: opts.categoryNameAr ?? "",
    goal: opts.goal,
    participantNames: opts.participantNames ?? [],
  });
  if (!result || result.source !== "AI") return null;

  const validated = aiAgendaSchema.safeParse(result.items);
  if (!validated.success) {
    console.warn("[Agenda Service] AI agenda failed validation:", validated.error.issues);
    return null;
  }
  const items = validated.data;
  const total = items.reduce((acc, it) => acc + it.plannedMinutes, 0);
  if (total !== opts.durationMinutes) {
    console.warn(`[Agenda Service] AI agenda totals ${total} min, expected ${opts.durationMinutes}`);
    return null;
  }
  return items;
}

// ─────────────────────────────────────────────────────────────
// Save & Manage Agenda (FR-4.3 / FR-4.4 / FR-5.4)
// ─────────────────────────────────────────────────────────────

/**
 * Generates and saves the session agenda (via Gemini AI or Fallback).
 * If agenda already exists, returns the existing tasks.
 */
export async function generateAndSaveSessionAgenda(
  sessionId: string,
  client: PrismaClient = db,
) {
  const session = await client.session.findUnique({
    where: { id: sessionId },
    include: {
      skill: { include: { category: true } },
      agendaTasks: { orderBy: { position: "asc" } },
      teacher: { select: { displayName: true } },
      learner: { select: { displayName: true } },
    },
  });

  if (!session) {
    throw new DomainError("NOT_FOUND", "الجلسة غير موجودة");
  }

  // Already generated
  if (session.agendaTasks.length > 0) {
    return session.agendaTasks;
  }

  // 1. Try AI Generation (FR-4.3)
  let tasks = await generateAiAgenda({
    durationMinutes: session.durationMinutes,
    skillNameAr: session.skill.nameAr,
    categoryNameAr: session.skill.category.nameAr,
    goal: session.goal,
    participantNames: [session.teacher.displayName, session.learner.displayName],
  });

  let source: "AI" | "FALLBACK" = "AI";

  // 2. Fall back to deterministic standard agenda if AI fails (FR-4.4)
  if (!tasks || tasks.length === 0) {
    source = "FALLBACK";
    tasks = generateFallbackAgenda({
      durationMinutes: session.durationMinutes,
      skillNameAr: session.skill.nameAr,
      goal: session.goal,
    });
  }

  // 3. Atomically save tasks and update session metadata
  const now = new Date();
  return client.$transaction(async (tx) => {
    await tx.agendaTask.createMany({
      data: tasks.map((t, idx) => ({
        sessionId: session.id,
        position: idx,
        title: t.title,
        details: t.details || null,
        phase: t.phase,
        plannedMinutes: t.plannedMinutes,
        isDone: false,
      })),
    });

    await tx.session.update({
      where: { id: session.id },
      data: {
        agendaSource: source,
        agendaGeneratedAt: now,
      },
    });

    return tx.agendaTask.findMany({
      where: { sessionId: session.id },
      orderBy: { position: "asc" },
    });
  });
}

/**
 * FR-5.4 & FR-6.1: Toggles an agenda task as done/undone.
 * Only the session participants (teacher or learner) are authorized to check tasks.
 */
export async function toggleAgendaTask(
  taskId: string,
  userId: string,
  client: PrismaClient = db,
) {
  const task = await client.agendaTask.findUnique({
    where: { id: taskId },
    include: { session: true },
  });

  if (!task) {
    throw new DomainError("NOT_FOUND", "المهمة غير موجودة");
  }

  if (task.session.teacherId !== userId && task.session.learnerId !== userId) {
    throw new DomainError("FORBIDDEN", "لا تملك صلاحية تعديل مهام هذه الجلسة");
  }

  // Q-13: tasks can be ticked only while the session runs; afterwards they are evidence (FR-7.2).
  if (task.session.status !== "IN_PROGRESS") {
    throw new DomainError("INVALID_STATUS", "يمكن تأشير مهام الأجندة أثناء انعقاد الجلسة فقط");
  }

  const willBeDone = !task.isDone;
  const now = new Date();

  return client.$transaction(async (tx) => {
    const updated = await tx.agendaTask.update({
      where: { id: taskId },
      data: {
        isDone: willBeDone,
        doneAt: willBeDone ? now : null,
        doneById: willBeDone ? userId : null,
      },
    });

    // Compute updated completion percentage
    const allTasks = await tx.agendaTask.findMany({
      where: { sessionId: task.sessionId },
    });
    const doneCount = allTasks.filter((t) => t.isDone).length;
    const totalCount = allTasks.length;
    const completionPercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

    await tx.session.update({
      where: { id: task.sessionId },
      data: { completionPercent },
    });

    return {
      task: updated,
      completionPercent,
      doneCount,
      totalCount,
    };
  });
}

