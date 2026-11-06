import type { PrismaClient } from "@/generated/prisma/client";
import {
  COMPLETION_THRESHOLD_PERCENT,
  RELEASE_WINDOW_MINUTES,
} from "@/lib/rules";
import { db } from "@/server/db";
import { withWalletTransaction } from "@/server/services/wallet/ledger";

// ─────────────────────────────────────────────────────────────
// FR-6.1: Timer Expiry & Low Completion Auto-Refer
// ─────────────────────────────────────────────────────────────

export interface ExpireSessionResult {
  sessionId: string;
  status: "ENDED" | "DISPUTED" | "UNCHANGED";
  completionPercent: number;
}

export interface ExpireTimedOutResult {
  processedCount: number;
  endedCount: number;
  disputedCount: number;
}

/**
 * FR-6.1: Expires a specific session if its endAt has passed and it is IN_PROGRESS.
 * - If completionPercent >= 50:
 *     → ENDED with trigger "FR-6.1:timer-expired", sets releaseDueAt = now + 48h.
 * - If completionPercent < 50:
 *     → DISPUTED with trigger "FR-6.1:low-completion" (auto-refer to admin).
 *     → Creates a Dispute record with source LOW_COMPLETION.
 */
export async function expireSessionIfTimedOut(
  sessionId: string,
  now: Date = new Date(),
  client: PrismaClient = db,
): Promise<ExpireSessionResult> {
  return withWalletTransaction(client, async (tx) => {
    const current = await tx.session.findUnique({
      where: { id: sessionId },
      include: { agendaTasks: true },
    });

    if (!current || current.status !== "IN_PROGRESS" || current.endAt > now) {
      return {
        sessionId,
        status: "UNCHANGED",
        completionPercent: current?.completionPercent ?? 0,
      };
    }

    // Calculate completion percentage from agenda tasks
    const allTasks = current.agendaTasks;
    const doneTasks = allTasks.filter((t) => t.isDone);
    const completionPercent =
      allTasks.length > 0
        ? Math.round((doneTasks.length / allTasks.length) * 100)
        : 0;

    if (completionPercent >= COMPLETION_THRESHOLD_PERCENT) {
      // ≥ 50% → ENDED
      const releaseDueAt = new Date(
        now.getTime() + RELEASE_WINDOW_MINUTES * 60 * 1000,
      );

      const res = await tx.session.updateMany({
        where: { id: current.id, status: "IN_PROGRESS" },
        data: {
          status: "ENDED",
          endedAt: now,
          endReason: "TIMER_EXPIRED",
          completionPercent,
          releaseDueAt,
        },
      });

      if (res.count > 0) {
        await tx.sessionEvent.create({
          data: {
            sessionId: current.id,
            fromStatus: "IN_PROGRESS",
            toStatus: "ENDED",
            trigger: "FR-6.1:timer-expired",
            note: `انتهى وقت الجلسة بنسبة إنجاز ${completionPercent}% — تم الإتمام تلقائياً`,
          },
        });

        return {
          sessionId,
          status: "ENDED",
          completionPercent,
        };
      }
    } else {
      // < 50% → DISPUTED (auto-refer to admin)
      const res = await tx.session.updateMany({
        where: { id: current.id, status: "IN_PROGRESS" },
        data: {
          status: "DISPUTED",
          endedAt: now,
          endReason: "TIMER_EXPIRED",
          completionPercent,
        },
      });

      if (res.count > 0) {
        await tx.dispute.create({
          data: {
            sessionId: current.id,
            source: "LOW_COMPLETION",
            reason: `نسبة الإنجاز ${completionPercent}% أقل من الحد الأدنى المطلوب (${COMPLETION_THRESHOLD_PERCENT}%) — إحالة تلقائية للإدارة`,
          },
        });

        await tx.sessionEvent.create({
          data: {
            sessionId: current.id,
            fromStatus: "IN_PROGRESS",
            toStatus: "DISPUTED",
            trigger: "FR-6.1:low-completion",
            note: `انتهى وقت الجلسة بنسبة إنجاز ${completionPercent}% (أقل من 50%) — إحالة تلقائية للإدارة`,
          },
        });

        return {
          sessionId,
          status: "DISPUTED",
          completionPercent,
        };
      }
    }

    return {
      sessionId,
      status: "UNCHANGED",
      completionPercent,
    };
  });
}

/**
 * FR-6.1 / NFR-3: Background job that processes all IN_PROGRESS sessions
 * whose endAt has passed.
 */
export async function expireTimedOutSessions(
  client: PrismaClient = db,
  now: Date = new Date(),
): Promise<ExpireTimedOutResult> {
  const expiredSessions = await client.session.findMany({
    where: {
      status: "IN_PROGRESS",
      endAt: { lte: now },
    },
    select: { id: true },
  });

  const result: ExpireTimedOutResult = {
    processedCount: 0,
    endedCount: 0,
    disputedCount: 0,
  };

  for (const s of expiredSessions) {
    try {
      const outcome = await expireSessionIfTimedOut(s.id, now, client);
      result.processedCount += 1;
      if (outcome.status === "ENDED") result.endedCount += 1;
      if (outcome.status === "DISPUTED") result.disputedCount += 1;
    } catch {
      // Continue next session if an error occurs
    }
  }

  return result;
}
