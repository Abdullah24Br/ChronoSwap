import type { PrismaClient } from "@/generated/prisma/client";
import { RELEASE_WINDOW_MINUTES } from "@/lib/rules";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";

// ─────────────────────────────────────────────────────────────
// FR-6.4: Report Problem / Dispute System
// ─────────────────────────────────────────────────────────────

/** Statuses from which a participant can report a problem. */
const REPORTABLE_STATUSES = ["ENDED", "QUIZ_PENDING"] as const;

export interface ReportProblemInput {
  sessionId: string;
  userId: string;
  reason: string;
}

/**
 * FR-6.4: Either participant reports a problem within the 48h window.
 * Transitions session to DISPUTED with trigger "FR-6.4:report".
 * Creates a Dispute record with source USER_REPORT.
 */
export async function reportProblem(
  input: ReportProblemInput,
  client: PrismaClient = db,
  now: Date = new Date(),
) {
  const { sessionId, userId, reason } = input;

  if (!reason.trim()) {
    throw new DomainError("INVALID_INPUT", "يجب كتابة سبب الاعتراض");
  }

  return client.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      include: { dispute: true },
    });

    if (!session) {
      throw new DomainError("NOT_FOUND", "الجلسة غير موجودة");
    }

    // Only participants can report
    if (session.learnerId !== userId && session.teacherId !== userId) {
      throw new DomainError(
        "FORBIDDEN",
        "فقط المشاركون في الجلسة يمكنهم تقديم اعتراض",
      );
    }

    // Check session is in a reportable status
    if (!REPORTABLE_STATUSES.includes(session.status as (typeof REPORTABLE_STATUSES)[number])) {
      throw new DomainError(
        "INVALID_STATUS",
        "لا يمكن تقديم اعتراض لأن الجلسة ليست في حالة تسمح بذلك",
      );
    }

    // Check the 48h window (releaseDueAt)
    if (session.releaseDueAt && now > session.releaseDueAt) {
      throw new DomainError(
        "WINDOW_EXPIRED",
        `انتهت مهلة تقديم الاعتراض (${RELEASE_WINDOW_MINUTES / 60} ساعة بعد انتهاء الجلسة)`,
      );
    }

    // Prevent duplicate dispute
    if (session.dispute) {
      throw new DomainError(
        "DUPLICATE_DISPUTE",
        "تم تقديم اعتراض مسبقاً لهذه الجلسة",
      );
    }

    // Transition session to DISPUTED (CAS)
    const res = await tx.session.updateMany({
      where: {
        id: session.id,
        status: session.status,
      },
      data: {
        status: "DISPUTED",
      },
    });

    if (res.count === 0) {
      throw new DomainError("CONFLICT", "تغيرت حالة الجلسة مسبقاً");
    }

    // Create Dispute record
    const dispute = await tx.dispute.create({
      data: {
        sessionId,
        source: "USER_REPORT",
        openedById: userId,
        reason: reason.trim(),
      },
    });

    // Append session event
    await tx.sessionEvent.create({
      data: {
        sessionId,
        fromStatus: session.status,
        toStatus: "DISPUTED",
        trigger: "FR-6.4:report",
        actorId: userId,
        note: `اعتراض من المشارك: ${reason.trim().slice(0, 200)}`,
      },
    });

    return dispute;
  });
}

