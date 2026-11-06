import type { PrismaClient } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import { withWalletTransaction } from "@/server/services/wallet/ledger";
import { releaseSessionEscrow } from "@/server/services/wallet/wallet-service";

export interface ReleaseSessionResult {
  sessionId: string;
  status: "RELEASED" | "BARTER_COMPLETED" | "SKIPPED_DISPUTED" | "UNCHANGED";
  trigger?: "FR-8.4:quiz-timeout" | "FR-8.5:window-elapsed";
}

export interface ProcessDueReleasesResult {
  processedCount: number;
  releasedCount: number;
  barterCompletedCount: number;
  skippedDisputedCount: number;
}

/**
 * FR-8.4 & FR-8.5: Releases session hours to the teacher after the 48-hour window elapses.
 *
 * - FR-8.4 (quiz-timeout):
 *     If session is in QUIZ_PENDING (learner hasn't solved the quiz) and 48h has elapsed
 *     without an open dispute, hours are released automatically to the teacher.
 *     DIRECT: QUIZ_PENDING -> RELEASED (trigger: "FR-8.4:quiz-timeout").
 *     BARTER: QUIZ_PENDING -> BARTER_COMPLETED (trigger: "FR-8.4:quiz-timeout").
 *
 * - FR-8.5 (window-elapsed / safe fallback):
 *     If AI summary/quiz generation failed and session remained in ENDED, only the
 *     task-ticking condition applies; hours are released 48h after the session unless disputed.
 *     DIRECT: ENDED -> RELEASED (trigger: "FR-8.5:window-elapsed").
 *     BARTER: ENDED -> BARTER_COMPLETED (trigger: "FR-8.5:window-elapsed").
 *
 * - Strict dispute protection (FR-6.4 / FR-7.2):
 *     If session has an active dispute, release is strictly prevented (SKIPPED_DISPUTED).
 */
export async function processSessionRelease(
  sessionId: string,
  now: Date = new Date(),
  client: PrismaClient = db,
): Promise<ReleaseSessionResult> {
  return withWalletTransaction(client, async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      include: { dispute: true },
    });

    if (!session) {
      throw new DomainError("NOT_FOUND", "الجلسة غير موجودة");
    }

    // Skip if status is neither ENDED nor QUIZ_PENDING
    if (session.status !== "ENDED" && session.status !== "QUIZ_PENDING") {
      return { sessionId, status: "UNCHANGED" };
    }

    // Skip if 48h releaseDueAt has not arrived yet
    if (!session.releaseDueAt || session.releaseDueAt > now) {
      return { sessionId, status: "UNCHANGED" };
    }

    // Skip if there is an active dispute or problem report
    if (session.dispute) {
      return { sessionId, status: "SKIPPED_DISPUTED" };
    }

    const fromStatus = session.status;
    const trigger =
      fromStatus === "QUIZ_PENDING"
        ? ("FR-8.4:quiz-timeout" as const)
        : ("FR-8.5:window-elapsed" as const);

    if (session.kind === "DIRECT") {
      // Atomic CAS transition to RELEASED
      const res = await tx.session.updateMany({
        where: { id: session.id, status: fromStatus },
        data: {
          status: "RELEASED",
          settledAt: now,
        },
      });

      if (res.count === 0) {
        return { sessionId, status: "UNCHANGED" };
      }

      // Release escrow to teacher and repay teacher debts FIFO first (FR-2.3)
      await releaseSessionEscrow(tx, {
        learnerId: session.learnerId,
        teacherId: session.teacherId,
        sessionId: session.id,
        durationMinutes: session.durationMinutes,
        actorId: undefined, // System automated job (NFR-3)
        memo:
          trigger === "FR-8.4:quiz-timeout"
            ? "FR-8.4: تحرير تلقائي للساعات بعد انقضاء مهلة 48 ساعة دون حل الاختبار"
            : "FR-8.5: تحرير تلقائي للساعات بعد انقضاء 48 ساعة وفق خطة البديل الآمن",
      });

      await tx.sessionEvent.create({
        data: {
          sessionId: session.id,
          fromStatus,
          toStatus: "RELEASED",
          trigger,
          actorId: null,
          note:
            trigger === "FR-8.4:quiz-timeout"
              ? "تحرير تلقائي للمدرّس لعدم حل الاختبار خلال 48 ساعة من انتهاء الجلسة"
              : "تحرير تلقائي للمدرّس بعد 48 ساعة وفق خطة البديل الآمن لتعذر الذكاء الاصطناعي",
        },
      });

      return { sessionId, status: "RELEASED", trigger };
    } else {
      // Barter session transition to BARTER_COMPLETED
      const res = await tx.session.updateMany({
        where: { id: session.id, status: fromStatus },
        data: {
          status: "BARTER_COMPLETED",
          settledAt: now,
        },
      });

      if (res.count === 0) {
        return { sessionId, status: "UNCHANGED" };
      }

      await tx.sessionEvent.create({
        data: {
          sessionId: session.id,
          fromStatus,
          toStatus: "BARTER_COMPLETED",
          trigger,
          actorId: null,
          note:
            trigger === "FR-8.4:quiz-timeout"
              ? "اكتمال حصة الجلسة في المقايضة تلقائياً لعدم حل الاختبار خلال 48 ساعة"
              : "اكتمال حصة الجلسة في المقايضة تلقائياً بعد 48 ساعة وفق خطة البديل الآمن",
        },
      });

      return { sessionId, status: "BARTER_COMPLETED", trigger };
    }
  });
}

/**
 * FR-8.4 / FR-8.5 / NFR-3: Background job to scan and release all sessions whose
 * 48h timeout has passed without disputes.
 */
export async function processDueSessionReleases(
  client: PrismaClient = db,
  now: Date = new Date(),
): Promise<ProcessDueReleasesResult> {
  const dueSessions = await client.session.findMany({
    where: {
      status: { in: ["ENDED", "QUIZ_PENDING"] },
      releaseDueAt: { lte: now },
      dispute: null,
    },
    select: { id: true },
  });

  const result: ProcessDueReleasesResult = {
    processedCount: 0,
    releasedCount: 0,
    barterCompletedCount: 0,
    skippedDisputedCount: 0,
  };

  for (const s of dueSessions) {
    try {
      const outcome = await processSessionRelease(s.id, now, client);
      result.processedCount += 1;
      if (outcome.status === "RELEASED") result.releasedCount += 1;
      if (outcome.status === "BARTER_COMPLETED") result.barterCompletedCount += 1;
      if (outcome.status === "SKIPPED_DISPUTED") result.skippedDisputedCount += 1;
    } catch {
      // Continue next session if an isolated error occurs
    }
  }

  return result;
}
