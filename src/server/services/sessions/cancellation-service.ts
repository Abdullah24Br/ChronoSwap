import type { AttendanceEvent, PrismaClient, SessionStatus } from "@/generated/prisma/client";
import {
  CANCELLATION_CUTOFF_MINUTES,
  NO_SHOW_GRACE_MINUTES,
} from "@/lib/rules";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import { settleFailedBarterCycleSession } from "@/server/services/barter/barter-service";
import { withWalletTransaction } from "@/server/services/wallet/ledger";
import {
  refundSessionEscrow,
  releaseSessionEscrow,
} from "@/server/services/wallet/wallet-service";

// ─────────────────────────────────────────────────────────────
// FR-4.5: Session Duration & Invariance
// ─────────────────────────────────────────────────────────────

/**
 * FR-4.5: A session always costs its full booked duration, even if it ends early;
 * it cannot be extended during the session.
 */
export function assertSessionDurationImmutable(
  existingDurationMinutes: number,
  newDurationMinutes?: number,
) {
  if (newDurationMinutes !== undefined && newDurationMinutes !== existingDurationMinutes) {
    throw new DomainError(
      "DURATION_IMMUTABLE",
      "لا يمكن تعديل أو تمديد مدة الجلسة المحجوزة وفق المتطلب FR-4.5",
    );
  }
}

// ─────────────────────────────────────────────────────────────
// FR-4.6: Cancellation Policy (12-hour rule)
// ─────────────────────────────────────────────────────────────

export interface CancelSessionResult {
  sessionId: string;
  previousStatus: SessionStatus;
  newStatus: SessionStatus;
  isLate: boolean;
  walletOutcome: "REFUNDED_TO_LEARNER" | "TRANSFERRED_TO_TEACHER" | "BARTER_SETTLED" | "NONE";
}

/**
 * FR-4.6: Either participant cancels an ACCEPTED session.
 *
 * Rules:
 * - Cancelled >= 12h before startAt:
 *     Status -> CANCELLED
 *     Escrow -> full refund to learner (DIRECT)
 *     Trigger: "FR-4.6:cancel-in-time"
 * - Cancelled < 12h before startAt (counted as absence):
 *   - By Teacher:
 *       Status -> NO_SHOW_TEACHER
 *       Escrow -> full refund to learner (DIRECT)
 *       Trigger: "FR-4.6:teacher-late-cancel"
 *   - By Learner:
 *       Status -> NO_SHOW_LEARNER
 *       Escrow -> transferred to teacher (DIRECT: releaseSessionEscrow; BARTER: settleFailedBarterCycleSession)
 *       Trigger: "FR-4.6:learner-late-cancel"
 */
export async function cancelAcceptedSession(
  userId: string,
  opts: {
    sessionId: string;
    reason?: string;
  },
  client: PrismaClient = db,
  now: Date = new Date(),
): Promise<CancelSessionResult> {
  return withWalletTransaction(client, async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: opts.sessionId },
      include: {
        learner: { select: { id: true, displayName: true } },
        teacher: { select: { id: true, displayName: true } },
      },
    });

    if (!session) {
      throw new DomainError("NOT_FOUND", "الجلسة غير موجودة");
    }

    const isLearner = session.learnerId === userId;
    const isTeacher = session.teacherId === userId;

    if (!isLearner && !isTeacher) {
      throw new DomainError("FORBIDDEN", "لا تملك صلاحية إلغاء هذه الجلسة");
    }

    if (session.status !== "ACCEPTED") {
      throw new DomainError(
        "INVALID_STATUS",
        "لا يمكن إلغاء هذه الجلسة لأنها ليست في حالة مقبولة ومؤكدة",
      );
    }

    const startMs = session.startAt.getTime();
    const nowMs = now.getTime();
    const minutesUntilStart = (startMs - nowMs) / (60 * 1000);
    const isTimely = minutesUntilStart >= CANCELLATION_CUTOFF_MINUTES;

    if (isTimely) {
      // Case 1: Cancelled >= 12h before startAt
      const res = await tx.session.updateMany({
        where: { id: session.id, status: "ACCEPTED" },
        data: {
          status: "CANCELLED",
          cancelledAt: now,
          cancelledById: userId,
          cancelReason: opts.reason?.trim() || "إلغاء الجلسة قبل موعدها بأكثر من 12 ساعة",
        },
      });

      if (res.count === 0) {
        throw new DomainError("CONFLICT", "تغيرت حالة الجلسة مسبقاً");
      }

      let walletOutcome: CancelSessionResult["walletOutcome"] = "NONE";
      if (session.kind === "DIRECT") {
        await refundSessionEscrow(tx, {
          learnerId: session.learnerId,
          sessionId: session.id,
          durationMinutes: session.durationMinutes,
          actorId: userId,
          memo: "FR-4.6: استرجاع الرصيد لإلغاء الجلسة قبل موعدها بأكثر من 12 ساعة",
        });
        walletOutcome = "REFUNDED_TO_LEARNER";
      }

      await tx.sessionEvent.create({
        data: {
          sessionId: session.id,
          fromStatus: "ACCEPTED",
          toStatus: "CANCELLED",
          trigger: "FR-4.6:cancel-in-time",
          actorId: userId,
          note: opts.reason?.trim() || "إلغاء في الوقت المسموح (قبل 12 ساعة على الأقل)",
        },
      });

      return {
        sessionId: session.id,
        previousStatus: "ACCEPTED",
        newStatus: "CANCELLED",
        isLate: false,
        walletOutcome,
      };
    } else {
      // Case 2: Cancelled < 12h before startAt (counted as absence / no-show)
      if (isTeacher) {
        // Teacher cancelled late -> NO_SHOW_TEACHER -> learner refunded
        const res = await tx.session.updateMany({
          where: { id: session.id, status: "ACCEPTED" },
          data: {
            status: "NO_SHOW_TEACHER",
            cancelledAt: now,
            cancelledById: userId,
            cancelReason:
              opts.reason?.trim() || "إلغاء متأخر من قبل المدرّس خلال آخر 12 ساعة قبل الموعد",
            settledAt: now,
          },
        });

        if (res.count === 0) {
          throw new DomainError("CONFLICT", "تغيرت حالة الجلسة مسبقاً");
        }

        let walletOutcome: CancelSessionResult["walletOutcome"] = "NONE";
        if (session.kind === "DIRECT") {
          await refundSessionEscrow(tx, {
            learnerId: session.learnerId,
            sessionId: session.id,
            durationMinutes: session.durationMinutes,
            actorId: userId,
            memo: "FR-4.6: استرجاع الرصيد للمتعلم لإلغاء المدرّس المتأخر",
          });
          walletOutcome = "REFUNDED_TO_LEARNER";
        }

        await tx.sessionEvent.create({
          data: {
            sessionId: session.id,
            fromStatus: "ACCEPTED",
            toStatus: "NO_SHOW_TEACHER",
            trigger: "FR-4.6:teacher-late-cancel",
            actorId: userId,
            note: opts.reason?.trim() || "إلغاء متأخر من قبل المدرّس (احتسب غياباً)",
          },
        });

        return {
          sessionId: session.id,
          previousStatus: "ACCEPTED",
          newStatus: "NO_SHOW_TEACHER",
          isLate: true,
          walletOutcome,
        };
      } else {
        // Learner cancelled late -> NO_SHOW_LEARNER -> hours transferred to teacher
        const res = await tx.session.updateMany({
          where: { id: session.id, status: "ACCEPTED" },
          data: {
            status: "NO_SHOW_LEARNER",
            cancelledAt: now,
            cancelledById: userId,
            cancelReason:
              opts.reason?.trim() || "إلغاء متأخر من قبل المتعلم خلال آخر 12 ساعة قبل الموعد",
            settledAt: now,
          },
        });

        if (res.count === 0) {
          throw new DomainError("CONFLICT", "تغيرت حالة الجلسة مسبقاً");
        }

        let walletOutcome: CancelSessionResult["walletOutcome"] = "NONE";
        if (session.kind === "DIRECT") {
          await releaseSessionEscrow(tx, {
            learnerId: session.learnerId,
            teacherId: session.teacherId,
            sessionId: session.id,
            durationMinutes: session.durationMinutes,
            actorId: userId,
            memo: "FR-4.6: تحويل الرصيد للمدرّس لإلغاء المتعلم المتأخر (غياب)",
          });
          walletOutcome = "TRANSFERRED_TO_TEACHER";
        } else {
          // Barter session: settle as failed barter session
          await settleFailedBarterCycleSession(tx, {
            sessionId: session.id,
            actorId: userId,
            memo: "FR-4.6: تسوية جلسة مقايضة ملغاة متأخراً من المتعلم",
          });
          walletOutcome = "BARTER_SETTLED";
        }

        await tx.sessionEvent.create({
          data: {
            sessionId: session.id,
            fromStatus: "ACCEPTED",
            toStatus: "NO_SHOW_LEARNER",
            trigger: "FR-4.6:learner-late-cancel",
            actorId: userId,
            note: opts.reason?.trim() || "إلغاء متأخر من قبل المتعلم (تحويل الرصيد للمدرّس)",
          },
        });

        return {
          sessionId: session.id,
          previousStatus: "ACCEPTED",
          newStatus: "NO_SHOW_LEARNER",
          isLate: true,
          walletOutcome,
        };
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────
// FR-5.1 & FR-4.6: Room Attendance Logging & In-Progress Transition
// ─────────────────────────────────────────────────────────────

export interface RecordAttendanceResult {
  sessionId: string;
  userId: string;
  event: AttendanceEvent;
  bothJoined: boolean;
  status: SessionStatus;
}

/**
 * FR-5.1 / FR-4.6: Records participant entry/exit in the interactive session room.
 * When both teacher and learner join an ACCEPTED session, transitions status to IN_PROGRESS.
 */
export async function recordSessionAttendance(
  userId: string,
  sessionId: string,
  event: AttendanceEvent = "JOIN",
  client: PrismaClient = db,
  now: Date = new Date(),
): Promise<RecordAttendanceResult> {
  return withWalletTransaction(client, async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new DomainError("NOT_FOUND", "الجلسة غير موجودة");
    }

    const isLearner = session.learnerId === userId;
    const isTeacher = session.teacherId === userId;

    if (!isLearner && !isTeacher) {
      throw new DomainError("FORBIDDEN", "لا تملك صلاحية الوصول لغرفة هذه الجلسة");
    }

    // Append attendance log
    await tx.attendanceLog.create({
      data: {
        sessionId,
        userId,
        event,
        at: now,
      },
    });

    if (event !== "JOIN") {
      return {
        sessionId,
        userId,
        event,
        bothJoined: false,
        status: session.status,
      };
    }

    // Update first joined timestamps cache
    const teacherFirstJoinedAt =
      isTeacher && !session.teacherFirstJoinedAt ? now : session.teacherFirstJoinedAt;
    const learnerFirstJoinedAt =
      isLearner && !session.learnerFirstJoinedAt ? now : session.learnerFirstJoinedAt;

    const bothJoined = Boolean(teacherFirstJoinedAt && learnerFirstJoinedAt);

    if (session.status === "ACCEPTED" && bothJoined) {
      // Transition ACCEPTED -> IN_PROGRESS
      const res = await tx.session.updateMany({
        where: { id: session.id, status: "ACCEPTED" },
        data: {
          status: "IN_PROGRESS",
          startedAt: now,
          teacherFirstJoinedAt,
          learnerFirstJoinedAt,
        },
      });

      if (res.count > 0) {
        await tx.sessionEvent.create({
          data: {
            sessionId: session.id,
            fromStatus: "ACCEPTED",
            toStatus: "IN_PROGRESS",
            trigger: "FR-5.1:both-joined",
            actorId: userId,
            note: "انضمام كلا الطرفين (المدرّس والمتعلم) إلى غرفة الجلسة",
          },
        });

        return {
          sessionId,
          userId,
          event,
          bothJoined: true,
          status: "IN_PROGRESS",
        };
      }
    } else if (teacherFirstJoinedAt !== session.teacherFirstJoinedAt || learnerFirstJoinedAt !== session.learnerFirstJoinedAt) {
      // Update first join timestamp cache on session row
      await tx.session.update({
        where: { id: session.id },
        data: {
          teacherFirstJoinedAt,
          learnerFirstJoinedAt,
        },
      });
    }

    return {
      sessionId,
      userId,
      event,
      bothJoined,
      status: session.status,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// FR-4.6 & NFR-3: Automated No-Show Detection Job
// ─────────────────────────────────────────────────────────────

export interface ProcessNoShowsResult {
  processedCount: number;
  noShowTeacherCount: number;
  noShowLearnerCount: number;
  noShowBothCount: number;
}

/**
 * FR-4.6 & NFR-3: Checks sessions whose start time has passed by NO_SHOW_GRACE_MINUTES (15 min).
 * If a session is still in ACCEPTED state after 15 minutes:
 * - If neither joined: NO_SHOW_BOTH -> refund learner
 * - If teacher joined, learner didn't: NO_SHOW_LEARNER -> hours to teacher
 * - If learner joined, teacher didn't: NO_SHOW_TEACHER -> refund learner
 */
export async function processNoShowSessions(
  client: PrismaClient = db,
  now: Date = new Date(),
): Promise<ProcessNoShowsResult> {
  // Grace cutoff: startAt <= now - 15 minutes
  const cutoff = new Date(now.getTime() - NO_SHOW_GRACE_MINUTES * 60 * 1000);

  const pendingNoShows = await client.session.findMany({
    where: {
      status: "ACCEPTED",
      startAt: { lte: cutoff },
    },
  });

  const result: ProcessNoShowsResult = {
    processedCount: 0,
    noShowTeacherCount: 0,
    noShowLearnerCount: 0,
    noShowBothCount: 0,
  };

  for (const session of pendingNoShows) {
    try {
      await withWalletTransaction(client, async (tx) => {
        // Re-check session status in transaction
        const currentSession = await tx.session.findUnique({
          where: { id: session.id },
        });

        if (!currentSession || currentSession.status !== "ACCEPTED") {
          return;
        }

        const graceLimit = new Date(
          currentSession.startAt.getTime() + NO_SHOW_GRACE_MINUTES * 60 * 1000,
        );

        // Check attendance logs or cached timestamps
        const teacherLog = await tx.attendanceLog.findFirst({
          where: {
            sessionId: currentSession.id,
            userId: currentSession.teacherId,
            event: "JOIN",
            at: { lte: graceLimit },
          },
        });

        const learnerLog = await tx.attendanceLog.findFirst({
          where: {
            sessionId: currentSession.id,
            userId: currentSession.learnerId,
            event: "JOIN",
            at: { lte: graceLimit },
          },
        });

        const teacherJoined =
          Boolean(teacherLog) ||
          (Boolean(currentSession.teacherFirstJoinedAt) &&
            currentSession.teacherFirstJoinedAt! <= graceLimit);

        const learnerJoined =
          Boolean(learnerLog) ||
          (Boolean(currentSession.learnerFirstJoinedAt) &&
            currentSession.learnerFirstJoinedAt! <= graceLimit);

        if (teacherJoined && learnerJoined) {
          // Concurrency edge case: both joined, transition to IN_PROGRESS
          await tx.session.updateMany({
            where: { id: currentSession.id, status: "ACCEPTED" },
            data: { status: "IN_PROGRESS", startedAt: now },
          });
          await tx.sessionEvent.create({
            data: {
              sessionId: currentSession.id,
              fromStatus: "ACCEPTED",
              toStatus: "IN_PROGRESS",
              trigger: "FR-5.1:both-joined",
              note: "انضم كلا الطرفين وتم التحويل للجلسة النشطة أثناء فحص الحضور",
            },
          });
          return;
        }

        if (!teacherJoined && !learnerJoined) {
          // Scenario 1: Both absent
          const updateRes = await tx.session.updateMany({
            where: { id: currentSession.id, status: "ACCEPTED" },
            data: {
              status: "NO_SHOW_BOTH",
              settledAt: now,
              cancelReason: "عدم حضور كلا الطرفين خلال 15 دقيقة من الموعد",
            },
          });

          if (updateRes.count > 0) {
            if (currentSession.kind === "DIRECT") {
              await refundSessionEscrow(tx, {
                learnerId: currentSession.learnerId,
                sessionId: currentSession.id,
                durationMinutes: currentSession.durationMinutes,
                memo: "FR-4.6: استرجاع الرصيد لغياب كلا الطرفين عن الجلسة",
              });
            }

            await tx.sessionEvent.create({
              data: {
                sessionId: currentSession.id,
                fromStatus: "ACCEPTED",
                toStatus: "NO_SHOW_BOTH",
                trigger: "FR-4.6:both-absent",
                note: "غياب كلا الطرفين بعد مرور مهلة الـ 15 دقيقة",
              },
            });

            result.processedCount += 1;
            result.noShowBothCount += 1;
          }
        } else if (!teacherJoined && learnerJoined) {
          // Scenario 2: Teacher absent, Learner joined
          const updateRes = await tx.session.updateMany({
            where: { id: currentSession.id, status: "ACCEPTED" },
            data: {
              status: "NO_SHOW_TEACHER",
              settledAt: now,
              cancelReason: "غياب المدرّس خلال 15 دقيقة من موعد الجلسة",
            },
          });

          if (updateRes.count > 0) {
            if (currentSession.kind === "DIRECT") {
              await refundSessionEscrow(tx, {
                learnerId: currentSession.learnerId,
                sessionId: currentSession.id,
                durationMinutes: currentSession.durationMinutes,
                memo: "FR-4.6: استرجاع الرصيد لغياب المدرّس عن الجلسة",
              });
            }

            await tx.sessionEvent.create({
              data: {
                sessionId: currentSession.id,
                fromStatus: "ACCEPTED",
                toStatus: "NO_SHOW_TEACHER",
                trigger: "FR-4.6:teacher-absent",
                note: "غياب المدرّس بعد مرور مهلة الـ 15 دقيقة (حضور المتعلم)",
              },
            });

            result.processedCount += 1;
            result.noShowTeacherCount += 1;
          }
        } else if (teacherJoined && !learnerJoined) {
          // Scenario 3: Learner absent, Teacher joined -> hours go to teacher
          const updateRes = await tx.session.updateMany({
            where: { id: currentSession.id, status: "ACCEPTED" },
            data: {
              status: "NO_SHOW_LEARNER",
              settledAt: now,
              cancelReason: "غياب المتعلم خلال 15 دقيقة من موعد الجلسة (حضور المدرّس)",
            },
          });

          if (updateRes.count > 0) {
            if (currentSession.kind === "DIRECT") {
              await releaseSessionEscrow(tx, {
                learnerId: currentSession.learnerId,
                teacherId: currentSession.teacherId,
                sessionId: currentSession.id,
                durationMinutes: currentSession.durationMinutes,
                memo: "FR-4.6: تحويل الرصيد للمدرّس لغياب المتعلم عن الجلسة",
              });
            } else {
              await settleFailedBarterCycleSession(tx, {
                sessionId: currentSession.id,
                memo: "FR-4.6: تسوية جلسة المقايضة لغياب المتعلم",
              });
            }

            await tx.sessionEvent.create({
              data: {
                sessionId: currentSession.id,
                fromStatus: "ACCEPTED",
                toStatus: "NO_SHOW_LEARNER",
                trigger: "FR-4.6:learner-absent",
                note: "غياب المتعلم بعد مرور مهلة الـ 15 دقيقة وحضور المدرّس (تحويل الرصيد للمدرّس)",
              },
            });

            result.processedCount += 1;
            result.noShowLearnerCount += 1;
          }
        }
      });
    } catch {
      // Continue next session if an error occurs on one
    }
  }

  return result;
}
