import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import type { SessionStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";

/** Statuses of a session that actually took place and finished (FR-5.5). */
const ARCHIVED_STATUSES: SessionStatus[] = [
  "ENDED",
  "QUIZ_PENDING",
  "DISPUTED",
  "RELEASED",
  "RESOLVED_REFUNDED",
  "RESOLVED_RELEASED",
  "BARTER_COMPLETED",
  "BARTER_SETTLED",
];

const KeyPointsSchema = z.array(z.string());
const ExercisesSchema = z.array(z.object({ title: z.string(), description: z.string() }));

export interface ArchiveEntry {
  sessionId: string;
  status: SessionStatus;
  kind: "DIRECT" | "BARTER";
  skillNameAr: string;
  teacherName: string;
  startAt: Date;
  durationMinutes: number;
  goal: string;
  notes: string;
  code: string;
  codeLanguage: string;
  /** FR-8.2: null when the AI failed or has not answered yet (FR-8.5 keeps notes and code only). */
  summary: { text: string; keyPoints: string[]; exercises: { title: string; description: string }[] } | null;
  quiz: { correctCount: number; totalCount: number } | null;
  ticked: { done: number; total: number };
}

/**
 * FR-5.5 / FR-8.2: the learner's permanent learning archive: every finished session in which they
 * were the learner, with the room's notes and code, the AI summary and exercises, and the quiz score.
 * Authorization: filtered by `learnerId`, so a user only ever sees their own archive.
 */
export async function getLearningArchive(
  learnerId: string,
  client: PrismaClient = db,
): Promise<ArchiveEntry[]> {
  const sessions = await client.session.findMany({
    where: { learnerId, status: { in: ARCHIVED_STATUSES } },
    orderBy: { startAt: "desc" },
    include: {
      skill: { select: { nameAr: true } },
      teacher: { select: { displayName: true } },
      workspace: { select: { notes: true, code: true, codeLanguage: true } },
      aiSummary: { select: { status: true, summary: true, keyPoints: true, exercises: true } },
      quiz: { select: { attempt: { select: { correctCount: true, totalCount: true } } } },
      agendaTasks: { select: { isDone: true } },
    },
  });

  return sessions.map((s) => {
    const ai = s.aiSummary;
    const keyPoints = KeyPointsSchema.safeParse(ai?.keyPoints);
    const exercises = ExercisesSchema.safeParse(ai?.exercises);
    return {
      sessionId: s.id,
      status: s.status,
      kind: s.kind,
      skillNameAr: s.skill.nameAr,
      teacherName: s.teacher.displayName,
      startAt: s.startAt,
      durationMinutes: s.durationMinutes,
      goal: s.goal,
      notes: s.workspace?.notes ?? "",
      code: s.workspace?.code ?? "",
      codeLanguage: s.workspace?.codeLanguage ?? "plaintext",
      summary:
        ai?.status === "SUCCEEDED" && ai.summary
          ? {
              text: ai.summary,
              keyPoints: keyPoints.success ? keyPoints.data : [],
              exercises: exercises.success ? exercises.data : [],
            }
          : null,
      quiz: s.quiz?.attempt ?? null,
      ticked: {
        done: s.agendaTasks.filter((t) => t.isDone).length,
        total: s.agendaTasks.length,
      },
    };
  });
}
