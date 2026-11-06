import type { PrismaClient } from "@/generated/prisma/client";
import { COMPLETION_THRESHOLD_PERCENT, RELEASE_WINDOW_MINUTES } from "@/lib/rules";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import { withWalletTransaction } from "@/server/services/wallet/ledger";
import { generateSessionSummaryAndQuiz } from "@/server/services/ai/summary-quiz-service";
import { recordSessionAttendance } from "./cancellation-service";

// ─────────────────────────────────────────────────────────────
// FR-5.1: Room Access Control & Room State
// ─────────────────────────────────────────────────────────────

/**
 * FR-5.1: Fetches the interactive session room data.
 * - Enforces access control: accessible only to teacher or learner.
 * - Rejects unconfirmed sessions (PENDING, REJECTED, AUTO_REJECTED).
 * - Records attendance for active sessions (ACCEPTED, IN_PROGRESS).
 * - Ensures a workspace row exists for notes and code (FR-5.3).
 */
export async function getSessionRoomData(
  sessionId: string,
  userId: string,
  client: PrismaClient = db,
) {
  const session = await client.session.findUnique({
    where: { id: sessionId },
    include: {
      learner: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          timezone: true,
        },
      },
      teacher: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          timezone: true,
        },
      },
      skill: {
        include: {
          category: true,
        },
      },
      agendaTasks: {
        orderBy: { position: "asc" },
      },
      workspace: true,
      aiSummary: true,
      quiz: {
        include: {
          questions: { orderBy: { position: "asc" } },
          attempt: true,
        },
      },
      rating: true,
      dispute: true,
    },
  });

  if (!session) {
    throw new DomainError("NOT_FOUND", "الجلسة غير موجودة");
  }

  const isLearner = session.learnerId === userId;
  const isTeacher = session.teacherId === userId;

  if (!isLearner && !isTeacher) {
    throw new DomainError("FORBIDDEN", "لا تملك صلاحية الوصول إلى غرفة هذه الجلسة");
  }

  // Check if room is accessible
  const forbiddenStatuses = ["PENDING", "REJECTED", "AUTO_REJECTED"];
  if (forbiddenStatuses.includes(session.status)) {
    throw new DomainError(
      "ROOM_NOT_READY",
      "غرفة الجلسة غير متاحة لأن الجلسة قيد الانتظار أو تم رفضها",
    );
  }

  // Ensure workspace exists (FR-5.3)
  let workspace = session.workspace;
  if (!workspace) {
    workspace = await client.sessionWorkspace.create({
      data: {
        sessionId: session.id,
        notes: "",
        code: "",
        codeLanguage: "javascript",
        revision: 0,
      },
    });
  }

  // Record attendance if session is active (FR-5.1)
  if (session.status === "ACCEPTED" || session.status === "IN_PROGRESS") {
    await recordSessionAttendance(userId, session.id, "JOIN", client);
  }

  // Re-fetch session status in case both joined and status transitioned to IN_PROGRESS
  const latestSession = await client.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      status: true,
      startedAt: true,
      endedAt: true,
      meetingUrl: true,
      completionPercent: true,
      releaseDueAt: true,
    },
  });

  return {
    ...session,
    status: latestSession.status,
    startedAt: latestSession.startedAt,
    endedAt: latestSession.endedAt,
    meetingUrl: latestSession.meetingUrl,
    completionPercent: latestSession.completionPercent,
    releaseDueAt: latestSession.releaseDueAt,
    workspace,
    isTeacher,
    isLearner,
  };
}

// ─────────────────────────────────────────────────────────────
// FR-5.2: External Call Link Management
// ─────────────────────────────────────────────────────────────

/**
 * FR-5.2: Updates the external call link (Google Meet / Zoom).
 */
export async function updateSessionMeetingUrl(
  userId: string,
  sessionId: string,
  meetingUrl: string,
  client: PrismaClient = db,
) {
  const session = await client.session.findUnique({
    where: { id: sessionId },
  });

  if (!session) {
    throw new DomainError("NOT_FOUND", "الجلسة غير موجودة");
  }

  if (session.teacherId !== userId && session.learnerId !== userId) {
    throw new DomainError("FORBIDDEN", "لا تملك صلاحية تعديل رابط المكالمة");
  }

  const cleanUrl = meetingUrl.trim();
  if (cleanUrl && !cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
    throw new DomainError("INVALID_URL", "يجب أن يبدأ رابط المكالمة بـ https:// أو http://");
  }

  return client.session.update({
    where: { id: sessionId },
    data: {
      meetingUrl: cleanUrl || null,
    },
  });
}

// ─────────────────────────────────────────────────────────────
// FR-5.3: Collaborative Workspace (Notes & Code Editor)
// ─────────────────────────────────────────────────────────────

export interface SaveWorkspaceInput {
  sessionId: string;
  notes: string;
  code: string;
  codeLanguage?: string;
  expectedRevision?: number;
}

/**
 * FR-5.3: Saves session notes and code with optimistic concurrency control.
 */
export async function saveSessionWorkspace(
  userId: string,
  input: SaveWorkspaceInput,
  client: PrismaClient = db,
) {
  const session = await client.session.findUnique({
    where: { id: input.sessionId },
  });

  if (!session) {
    throw new DomainError("NOT_FOUND", "الجلسة غير موجودة");
  }

  if (session.teacherId !== userId && session.learnerId !== userId) {
    throw new DomainError("FORBIDDEN", "لا تملك صلاحية تعديل مساحة عمل هذه الجلسة");
  }

  return client.$transaction(async (tx) => {
    const existing = await tx.sessionWorkspace.findUnique({
      where: { sessionId: input.sessionId },
    });

    if (!existing) {
      return tx.sessionWorkspace.create({
        data: {
          sessionId: input.sessionId,
          notes: input.notes,
          code: input.code,
          codeLanguage: input.codeLanguage || "javascript",
          revision: 1,
          updatedById: userId,
        },
      });
    }

    // Check optimistic concurrency if caller passed expected revision
    if (
      input.expectedRevision !== undefined &&
      existing.revision !== input.expectedRevision
    ) {
      throw new DomainError(
        "CONCURRENT_MODIFICATION",
        "تم تعديل مساحة العمل من الطرف الآخر. يُرجى تحديث الصفحة وحفظ التعديلات.",
      );
    }

    return tx.sessionWorkspace.update({
      where: { sessionId: input.sessionId },
      data: {
        notes: input.notes,
        code: input.code,
        codeLanguage: input.codeLanguage || existing.codeLanguage,
        revision: { increment: 1 },
        updatedById: userId,
      },
    });
  });
}

// ─────────────────────────────────────────────────────────────
// FR-5.4 & FR-6.1: Complete Session
// ─────────────────────────────────────────────────────────────

/**
 * FR-6.1: Either participant clicks "Complete session".
 * - Only enabled once >= 50% of agenda tasks are checked.
 * - Transitions status from IN_PROGRESS (or ACCEPTED) to ENDED.
 * - Recorded in full according to FR-4.5.
 * - Sets releaseDueAt = endedAt + 48h (FR-6.4 / FR-8.4 / FR-8.5).
 */
export async function completeSessionByParticipant(
  userId: string,
  sessionId: string,
  client: PrismaClient = db,
  now: Date = new Date(),
) {
  const result = await withWalletTransaction(client, async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      include: { agendaTasks: true },
    });

    if (!session) {
      throw new DomainError("NOT_FOUND", "الجلسة غير موجودة");
    }

    if (session.teacherId !== userId && session.learnerId !== userId) {
      throw new DomainError("FORBIDDEN", "لا تملك صلاحية إتمام هذه الجلسة");
    }

    if (session.status !== "IN_PROGRESS" && session.status !== "ACCEPTED") {
      throw new DomainError(
        "INVALID_STATUS",
        "لا يمكن إتمام هذه الجلسة لأنها ليست قيد الانعقاد",
      );
    }

    // Calculate completion percentage
    const allTasks = session.agendaTasks;
    const doneTasks = allTasks.filter((t) => t.isDone);
    const completionPercent =
      allTasks.length > 0 ? Math.round((doneTasks.length / allTasks.length) * 100) : 0;

    if (completionPercent < COMPLETION_THRESHOLD_PERCENT) {
      throw new DomainError(
        "THRESHOLD_NOT_MET",
        `لا يمكن إتمام الجلسة قبل إنجاز 50% على الأقل من مهام الأجندة (المنجز حالياً: ${completionPercent}%)`,
      );
    }

    const releaseDueAt = new Date(now.getTime() + RELEASE_WINDOW_MINUTES * 60 * 1000);

    const res = await tx.session.updateMany({
      where: {
        id: session.id,
        status: { in: ["IN_PROGRESS", "ACCEPTED"] },
      },
      data: {
        status: "ENDED",
        endedAt: now,
        endReason: "COMPLETE_BUTTON",
        endedById: userId,
        completionPercent,
        releaseDueAt,
      },
    });

    if (res.count === 0) {
      throw new DomainError("CONFLICT", "تغيرت حالة الجلسة مسبقاً");
    }

    await tx.sessionEvent.create({
      data: {
        sessionId: session.id,
        fromStatus: session.status,
        toStatus: "ENDED",
        trigger: "FR-6.1:complete-button",
        actorId: userId,
        note: `تم إنهاء الجلسة يدوياً بنسبة إنجاز ${completionPercent}%`,
      },
    });

    return tx.session.findUniqueOrThrow({
      where: { id: session.id },
      include: {
        agendaTasks: { orderBy: { position: "asc" } },
        workspace: true,
      },
    });
  });

  // FR-8.1: Asynchronously trigger AI summary & quiz generation
  generateSessionSummaryAndQuiz(sessionId, client, now).catch(() => {});

  return result;
}

