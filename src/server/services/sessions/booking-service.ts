import type { PrismaClient, SessionStatus } from "@/generated/prisma/client";
import {
  SESSION_DURATIONS,
  WEEKLY_PAIR_CAP_MINUTES,
  type SessionDuration,
} from "@/lib/rules";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import { hasOutstandingDebt } from "@/server/services/barter/barter-service";
import {
  withWalletTransaction,
  type Tx,
} from "@/server/services/wallet/ledger";
import {
  freezeSessionEscrow,
  refundSessionEscrow,
} from "@/server/services/wallet/wallet-service";
import { generateAndSaveSessionAgenda } from "@/server/services/ai/agenda-service";
import type { RequestSessionInput } from "./schemas";

// ─────────────────────────────────────────────────────────────
// Helpers for Availability & Weekly Cap
// ─────────────────────────────────────────────────────────────

/**
 * Returns the local weekday (0..6, Sun=0) and minute of day (0..1439)
 * for a UTC instant in the target timezone.
 */
export function getLocalWeekdayAndMinute(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);

  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    weekday: weekdayMap[weekdayStr] ?? 0,
    minuteOfDay: hour * 60 + minute,
  };
}

/**
 * FR-4.1: Checks if the requested [startAt, endAt) falls completely inside
 * the teacher's availability slots.
 */
export async function checkTeacherAvailability(
  teacherId: string,
  startAt: Date,
  endAt: Date,
  client: PrismaClient | Tx = db,
): Promise<boolean> {
  const teacher = await client.user.findUnique({
    where: { id: teacherId },
    select: {
      timezone: true,
      availability: true,
    },
  });

  if (!teacher || teacher.availability.length === 0) {
    return false;
  }

  const timeZone = teacher.timezone || "Asia/Damascus";
  const localStart = getLocalWeekdayAndMinute(startAt, timeZone);
  const localEnd = getLocalWeekdayAndMinute(endAt, timeZone);

  // If the session crosses midnight in the teacher's timezone, check if consecutive slots exist
  if (localStart.weekday !== localEnd.weekday) {
    // Cross-midnight: start must fit in localStart day until 1440, and localEnd day from 0
    const startFit = teacher.availability.some(
      (s) =>
        s.weekday === localStart.weekday &&
        s.startMinute <= localStart.minuteOfDay &&
        s.endMinute >= 1440,
    );
    const endFit = teacher.availability.some(
      (s) =>
        s.weekday === localEnd.weekday &&
        s.startMinute <= 0 &&
        s.endMinute >= localEnd.minuteOfDay,
    );
    return startFit && endFit;
  }

  // Single day: startMinute <= localStart && endMinute >= localEnd
  return teacher.availability.some(
    (s) =>
      s.weekday === localStart.weekday &&
      s.startMinute <= localStart.minuteOfDay &&
      s.endMinute >= localEnd.minuteOfDay,
  );
}

/**
 * Returns the calendar week boundary (Monday 00:00:00 UTC to next Monday 00:00:00 UTC)
 * for the given date instant.
 */
export function getCalendarWeekRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  const day = start.getUTCDay(); // 0 is Sun
  const diffToMonday = (day + 6) % 7; // Mon=0, Tue=1, ..., Sun=6
  start.setUTCDate(start.getUTCDate() - diffToMonday);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);

  return { start, end };
}

/**
 * FR-6.3: Checks whether booking durationMinutes would exceed the 180 min/week pair cap.
 */
export async function checkWeeklyPairCap(
  userA: string,
  userB: string,
  startAt: Date,
  durationMinutes: number,
  client: PrismaClient | Tx = db,
): Promise<{ allowed: boolean; currentTotalMinutes: number }> {
  const { start: weekStart, end: weekEnd } = getCalendarWeekRange(startAt);

  const countingStatuses: SessionStatus[] = [
    "PENDING",
    "ACCEPTED",
    "IN_PROGRESS",
    "ENDED",
    "QUIZ_PENDING",
    "RELEASED",
    "BARTER_COMPLETED",
    "BARTER_SETTLED",
    "RESOLVED_RELEASED",
    "NO_SHOW_LEARNER",
  ];

  const existingSessions = await client.session.findMany({
    where: {
      status: { in: countingStatuses },
      OR: [
        { teacherId: userA, learnerId: userB },
        { teacherId: userB, learnerId: userA },
      ],
      startAt: { gte: weekStart, lt: weekEnd },
    },
    select: { durationMinutes: true },
  });

  const currentTotalMinutes = existingSessions.reduce(
    (acc, s) => acc + s.durationMinutes,
    0,
  );

  return {
    allowed: currentTotalMinutes + durationMinutes <= WEEKLY_PAIR_CAP_MINUTES,
    currentTotalMinutes,
  };
}

/**
 * Checks if either participant has an active/pending session conflicting with [startAt, endAt).
 */
export async function checkSessionConflict(
  userId: string,
  startAt: Date,
  endAt: Date,
  client: PrismaClient | Tx = db,
): Promise<boolean> {
  const conflictStatuses: SessionStatus[] = [
    "PENDING",
    "ACCEPTED",
    "IN_PROGRESS",
  ];

  const conflict = await client.session.findFirst({
    where: {
      status: { in: conflictStatuses },
      OR: [{ teacherId: userId }, { learnerId: userId }],
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
  });

  return conflict !== null;
}

// ─────────────────────────────────────────────────────────────
// Core Booking (FR-4.1)
// ─────────────────────────────────────────────────────────────

/**
 * FR-4.1: Request a learning session with a teacher.
 * - Validates:
 *   1. Learner != Teacher.
 *   2. Learner has no outstanding debts (Q-16).
 *   3. Duration is allowed (30, 60, 90, 120).
 *   4. Start time is in the future.
 *   5. Teacher actually offers the requested skill.
 *   6. Teacher has available slot covering the entire [startAt, endAt).
 *   7. Neither participant has an overlapping session.
 *   8. Weekly pair cap (3h = 180 min) is not exceeded (FR-6.3).
 * - For DIRECT sessions: Freezes escrow in the learner's wallet atomically (FR-2.2).
 * - For BARTER sessions: Links to active barterCycleId with escrowMinutes = 0 (FR-3.4).
 */
export async function requestSession(
  learnerId: string,
  input: RequestSessionInput,
  client: PrismaClient = db,
) {
  // 1. Guard self-booking
  if (learnerId === input.teacherId) {
    throw new DomainError("SELF_BOOKING_NOT_ALLOWED", "لا يمكنك حجز جلسة تعليمية مع نفسك");
  }

  // 2. Validate duration
  if (!SESSION_DURATIONS.includes(input.durationMinutes as SessionDuration)) {
    throw new DomainError(
      "INVALID_DURATION",
      "مدة الجلسة يجب أن تكون 30 أو 60 أو 90 أو 120 دقيقة",
    );
  }

  // 3. Check learner debt
  const isDebtor = await hasOutstandingDebt(learnerId, client);
  if (isDebtor) {
    throw new DomainError(
      "USER_IN_DEBT",
      "لديك ديون سابقة غير مسددة تمنعك من حجز جلسات جديدة حتى سدادها",
    );
  }

  // 4. Verify start time is in future
  const startAt = new Date(input.startAt);
  const now = new Date();
  if (startAt <= now) {
    throw new DomainError("PAST_START_TIME", "موعد الجلسة يجب أن يكون في المستقبل");
  }

  const durationMinutes = input.durationMinutes;
  const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);

  // 5. Verify teacher offers requested skill
  const teacherSkill = await client.userSkill.findFirst({
    where: {
      userId: input.teacherId,
      skillId: input.skillId,
      kind: "OFFERED",
    },
  });
  if (!teacherSkill) {
    throw new DomainError(
      "SKILL_NOT_OFFERED",
      "المدرّس لا يعرض هذه المهارة المحددة للتدريس",
    );
  }

  // 6. Check teacher availability
  const isAvailable = await checkTeacherAvailability(
    input.teacherId,
    startAt,
    endAt,
    client,
  );
  if (!isAvailable) {
    throw new DomainError(
      "TEACHER_NOT_AVAILABLE",
      "الموعد المحدد يقع خارج الأوقات المتاحة للمدرّس",
    );
  }

  // 7. Check for scheduling conflicts (no double booking)
  const teacherHasConflict = await checkSessionConflict(
    input.teacherId,
    startAt,
    endAt,
    client,
  );
  if (teacherHasConflict) {
    throw new DomainError(
      "TEACHER_CONFLICT",
      "المدرّس لديه جلسة أخرى في هذا التوقيت المحدد",
    );
  }

  const learnerHasConflict = await checkSessionConflict(
    learnerId,
    startAt,
    endAt,
    client,
  );
  if (learnerHasConflict) {
    throw new DomainError(
      "LEARNER_CONFLICT",
      "لديك جلسة أخرى في هذا التوقيت المحدد",
    );
  }

  // 8. Check weekly pair cap (FR-6.3)
  const capCheck = await checkWeeklyPairCap(
    learnerId,
    input.teacherId,
    startAt,
    durationMinutes,
    client,
  );
  if (!capCheck.allowed) {
    throw new DomainError(
      "WEEKLY_CAP_EXCEEDED",
      `تم تجاوز الحد الأقصى للجلسات بين نفس الطرفين (3 ساعات أسبوعياً). مجموع الساعات الحالية: ${capCheck.currentTotalMinutes} دقيقة`,
    );
  }

  // 9. Execute session creation
  // If BARTER session:
  if (input.barterCycleId) {
    const cycle = await client.barterCycle.findUnique({
      where: { id: input.barterCycleId },
      include: { participants: true },
    });

    if (!cycle) {
      throw new DomainError("NOT_FOUND", "دورة المقايضة المحددة غير موجودة");
    }

    if (cycle.status !== "ACTIVE") {
      throw new DomainError(
        "BARTER_NOT_ACTIVE",
        "لا يمكن حجز جلسات لدورة مقايضة غير نشطة",
      );
    }

    if (cycle.durationMinutes !== durationMinutes) {
      throw new DomainError(
        "INVALID_DURATION",
        `مدة جلسات دورة المقايضة هذه محددة بـ ${cycle.durationMinutes} دقيقة`,
      );
    }

    // Verify teacher and learner pairing inside the cycle
    const pTeacher = cycle.participants.find((p) => p.userId === input.teacherId);
    const pLearner = cycle.participants.find((p) => p.userId === learnerId);

    if (!pTeacher || !pLearner) {
      throw new DomainError(
        "NOT_CYCLE_PARTICIPANT",
        "أحد الطرفين ليس مشاركاً في دورة المقايضة هذه",
      );
    }

    if ((pTeacher.position + 1) % 3 !== pLearner.position) {
      throw new DomainError(
        "INVALID_BARTER_PAIRING",
        "هذا الترتيب لا يطابق اتجاه المقايضة في الحلقة (المعلم لا يدّرس هذا المتعلم في الدورة)",
      );
    }

    if (pTeacher.teachesSkillId !== input.skillId) {
      throw new DomainError(
        "SKILL_MISMATCH",
        "المهارة المختارة لا تطابق المهارة المعتمدة في دورة المقايضة",
      );
    }

    // Create barter session (no escrow freeze)
    const barterSession = await client.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: {
          kind: "BARTER",
          status: "PENDING",
          learnerId,
          teacherId: input.teacherId,
          skillId: input.skillId,
          startAt,
          endAt,
          durationMinutes,
          goal: input.goal,
          escrowMinutes: 0,
          barterCycleId: input.barterCycleId,
        },
        include: {
          teacher: { select: { id: true, displayName: true, avatarUrl: true } },
          learner: { select: { id: true, displayName: true, avatarUrl: true } },
          skill: true,
        },
      });

      await tx.sessionEvent.create({
        data: {
          sessionId: session.id,
          toStatus: "PENDING",
          trigger: "FR-4.1:request",
          actorId: learnerId,
          note: "إرسال طلب حجز جلسة مقايضة ثلاثية",
        },
      });

      return session;
    });

    try {
      await generateAndSaveSessionAgenda(barterSession.id, client);
    } catch {
      // Agenda can still be generated later
    }

    return barterSession;
  }

  // If DIRECT session: Requires Escrow Freeze (FR-2.2)
  const directSession = await withWalletTransaction(client, async (tx) => {
    const session = await tx.session.create({
      data: {
        kind: "DIRECT",
        status: "PENDING",
        learnerId,
        teacherId: input.teacherId,
        skillId: input.skillId,
        startAt,
        endAt,
        durationMinutes,
        goal: input.goal,
        escrowMinutes: durationMinutes,
      },
      include: {
        teacher: { select: { id: true, displayName: true, avatarUrl: true } },
        learner: { select: { id: true, displayName: true, avatarUrl: true } },
        skill: true,
      },
    });

    // Freeze escrow atomically: throws InsufficientBalanceError if learner balance is short
    await freezeSessionEscrow(tx, {
      learnerId,
      sessionId: session.id,
      durationMinutes,
      actorId: learnerId,
      memo: `FR-2.2: تجميد رصيد طلب جلسة (${durationMinutes} دقيقة)`,
    });

    await tx.sessionEvent.create({
      data: {
        sessionId: session.id,
        toStatus: "PENDING",
        trigger: "FR-4.1:request",
        actorId: learnerId,
        note: "إرسال طلب حجز جلسة مباشرة مع تجميد الرصيد بالضمان",
      },
    });

    return session;
  });

  try {
    await generateAndSaveSessionAgenda(directSession.id, client);
  } catch {
    // Agenda can still be generated later
  }

  return directSession;
}

// ─────────────────────────────────────────────────────────────
// Query Helpers
// ─────────────────────────────────────────────────────────────

export async function getSessionById(
  sessionId: string,
  userId: string,
  client: PrismaClient = db,
) {
  const session = await client.session.findUnique({
    where: { id: sessionId },
    include: {
      teacher: { select: { id: true, displayName: true, avatarUrl: true, timezone: true } },
      learner: { select: { id: true, displayName: true, avatarUrl: true, timezone: true } },
      skill: { include: { category: true } },
      agendaTasks: { orderBy: { position: "asc" } },
      workspace: true,
      rating: true,
      dispute: true,
      aiSummary: true,
      quiz: { include: { questions: true } },
      barterCycle: true,
    },
  });

  if (!session) return null;
  if (session.teacherId !== userId && session.learnerId !== userId) {
    throw new DomainError("FORBIDDEN", "لا تملك صلاحية استعراض هذه الجلسة");
  }

  return session;
}

export async function getIncomingSessionRequests(
  teacherId: string,
  client: PrismaClient = db,
) {
  return client.session.findMany({
    where: {
      teacherId,
      status: "PENDING",
    },
    include: {
      learner: { select: { id: true, displayName: true, avatarUrl: true, timezone: true } },
      skill: { include: { category: true } },
    },
    orderBy: { startAt: "asc" },
  });
}

export async function getOutgoingSessionRequests(
  learnerId: string,
  client: PrismaClient = db,
) {
  return client.session.findMany({
    where: {
      learnerId,
      status: "PENDING",
    },
    include: {
      teacher: { select: { id: true, displayName: true, avatarUrl: true, timezone: true } },
      skill: { include: { category: true } },
    },
    orderBy: { startAt: "asc" },
  });
}

// ─────────────────────────────────────────────────────────────
// Teacher Decisions & Auto-Reject (FR-4.2)
// ─────────────────────────────────────────────────────────────

/**
 * FR-4.2: Teacher accepts a pending session request.
 * - Transitions status from PENDING to ACCEPTED using CAS (compare-and-set).
 * - Optionally stores meetingUrl (FR-5.2).
 * - Logs SessionEvent trigger 'FR-4.2:accept'.
 * - Auto-rejects any other PENDING sessions for teacher or learner that overlap with this accepted session (trigger: 'FR-4.2:slot-taken'), refunding their escrow.
 */
export async function acceptSessionRequest(
  teacherId: string,
  opts: { sessionId: string; meetingUrl?: string },
  client: PrismaClient = db,
) {
  return withWalletTransaction(client, async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: opts.sessionId },
    });

    if (!session) {
      throw new DomainError("NOT_FOUND", "الجلسة غير موجودة");
    }

    if (session.teacherId !== teacherId) {
      throw new DomainError("FORBIDDEN", "لا يمكنك قبول جلسة لست المدرّس فيها");
    }

    if (session.status !== "PENDING") {
      throw new DomainError(
        "INVALID_STATUS",
        "لا يمكن قبول هذا الطلب لأنه لم يعد معلّقاً",
      );
    }

    const now = new Date();
    if (session.startAt <= now) {
      throw new DomainError(
        "PAST_START_TIME",
        "انتهى موعد بدء الجلسة ولا يمكن قبولها الآن",
      );
    }

    // Atomic CAS transition PENDING -> ACCEPTED
    const res = await tx.session.updateMany({
      where: {
        id: session.id,
        status: "PENDING",
        teacherId,
      },
      data: {
        status: "ACCEPTED",
        respondedAt: now,
        meetingUrl: opts.meetingUrl?.trim() || null,
      },
    });

    if (res.count === 0) {
      throw new DomainError("CONFLICT", "تغيرت حالة هذا الطلب مسبقاً");
    }

    await tx.sessionEvent.create({
      data: {
        sessionId: session.id,
        fromStatus: "PENDING",
        toStatus: "ACCEPTED",
        trigger: "FR-4.2:accept",
        actorId: teacherId,
        note: "قبول طلب الجلسة من قبل المدرّس",
      },
    });

    // Auto-reject any conflicting PENDING requests for either participant (trigger: FR-4.2:slot-taken)
    const conflictingSessions = await tx.session.findMany({
      where: {
        id: { not: session.id },
        status: "PENDING",
        OR: [
          { teacherId: session.teacherId },
          { learnerId: session.teacherId },
          { teacherId: session.learnerId },
          { learnerId: session.learnerId },
        ],
        startAt: { lt: session.endAt },
        endAt: { gt: session.startAt },
      },
    });

    for (const conflict of conflictingSessions) {
      const conflictRes = await tx.session.updateMany({
        where: { id: conflict.id, status: "PENDING" },
        data: {
          status: "AUTO_REJECTED",
          respondedAt: now,
          cancelReason: "تضارب مع جلسة أخرى تم قبولها في نفس الموعد",
        },
      });

      if (conflictRes.count > 0) {
        if (conflict.kind === "DIRECT") {
          await refundSessionEscrow(tx, {
            learnerId: conflict.learnerId,
            sessionId: conflict.id,
            durationMinutes: conflict.durationMinutes,
            actorId: teacherId,
            memo: "FR-4.2: استرجاع الرصيد لتضارب الموعد مع جلسة مقبولة",
          });
        }

        await tx.sessionEvent.create({
          data: {
            sessionId: conflict.id,
            fromStatus: "PENDING",
            toStatus: "AUTO_REJECTED",
            trigger: "FR-4.2:slot-taken",
            actorId: teacherId,
            note: "رفض تلقائي لتضارب الموعد مع جلسة أخرى",
          },
        });
      }
    }

    return tx.session.findUniqueOrThrow({
      where: { id: session.id },
      include: {
        teacher: { select: { id: true, displayName: true, avatarUrl: true } },
        learner: { select: { id: true, displayName: true, avatarUrl: true } },
        skill: true,
      },
    });
  });
}

/**
 * FR-4.2: Teacher rejects a pending session request.
 * - Transitions status from PENDING to REJECTED using CAS.
 * - For DIRECT sessions: Automatically refunds frozen escrow back to learner's available balance (FR-2.4).
 * - For BARTER sessions: No escrow was frozen, so only status moves to REJECTED.
 * - Logs SessionEvent trigger 'FR-4.2:reject'.
 */
export async function rejectSessionRequest(
  teacherId: string,
  opts: { sessionId: string; reason?: string },
  client: PrismaClient = db,
) {
  return withWalletTransaction(client, async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: opts.sessionId },
    });

    if (!session) {
      throw new DomainError("NOT_FOUND", "الجلسة غير موجودة");
    }

    if (session.teacherId !== teacherId) {
      throw new DomainError("FORBIDDEN", "لا يمكنك رفض جلسة لست المدرّس فيها");
    }

    if (session.status !== "PENDING") {
      throw new DomainError(
        "INVALID_STATUS",
        "لا يمكن رفض هذا الطلب لأنه لم يعد معلّقاً",
      );
    }

    const now = new Date();
    const res = await tx.session.updateMany({
      where: {
        id: session.id,
        status: "PENDING",
        teacherId,
      },
      data: {
        status: "REJECTED",
        respondedAt: now,
        cancelReason: opts.reason?.trim() || "رفض الطلب من قبل المدرّس",
      },
    });

    if (res.count === 0) {
      throw new DomainError("CONFLICT", "تغيرت حالة هذا الطلب مسبقاً");
    }

    if (session.kind === "DIRECT") {
      await refundSessionEscrow(tx, {
        learnerId: session.learnerId,
        sessionId: session.id,
        durationMinutes: session.durationMinutes,
        actorId: teacherId,
        memo: "FR-2.4: استرجاع الرصيد لرفض الطلب من قبل المدرّس",
      });
    }

    await tx.sessionEvent.create({
      data: {
        sessionId: session.id,
        fromStatus: "PENDING",
        toStatus: "REJECTED",
        trigger: "FR-4.2:reject",
        actorId: teacherId,
        note: opts.reason?.trim() || "رفض الطلب من قبل المدرّس",
      },
    });

    return tx.session.findUniqueOrThrow({
      where: { id: session.id },
      include: {
        teacher: { select: { id: true, displayName: true, avatarUrl: true } },
        learner: { select: { id: true, displayName: true, avatarUrl: true } },
        skill: true,
      },
    });
  });
}

/**
 * FR-4.2: System auto-rejects unanswered pending sessions whose start time has arrived or passed.
 * - For each expired session: Transitions PENDING -> AUTO_REJECTED.
 * - For DIRECT sessions: Refunds escrow to learner (FR-2.4).
 * - Logs SessionEvent trigger 'FR-4.2:no-response'.
 */
export async function autoRejectExpiredRequests(
  client: PrismaClient = db,
  now: Date = new Date(),
) {
  const expiredSessions = await client.session.findMany({
    where: {
      status: "PENDING",
      startAt: { lte: now },
    },
  });

  let rejectedCount = 0;

  for (const session of expiredSessions) {
    try {
      await withWalletTransaction(client, async (tx) => {
        const res = await tx.session.updateMany({
          where: { id: session.id, status: "PENDING" },
          data: {
            status: "AUTO_REJECTED",
            respondedAt: now,
            cancelReason: "عدم استجابة المدرّس قبل موعد بدء الجلسة",
          },
        });

        if (res.count > 0) {
          if (session.kind === "DIRECT") {
            await refundSessionEscrow(tx, {
              learnerId: session.learnerId,
              sessionId: session.id,
              durationMinutes: session.durationMinutes,
              memo: "FR-2.4: استرجاع الرصيد لانتهاء مهلة الرد على طلب الجلسة",
            });
          }

          await tx.sessionEvent.create({
            data: {
              sessionId: session.id,
              fromStatus: "PENDING",
              toStatus: "AUTO_REJECTED",
              trigger: "FR-4.2:no-response",
              note: "رفض تلقائي لعدم رد المدرّس قبل بدء موعد الجلسة",
            },
          });

          rejectedCount += 1;
        }
      });
    } catch {
      // Continue processing other sessions even if one fails
    }
  }

  return { rejectedCount };
}

/**
 * FR-4.6 / FR-4.2: Learner withdraws/cancels their own pending request before teacher responds.
 * - Transitions status PENDING -> CANCELLED.
 * - Refunds escrow if DIRECT.
 * - Logs SessionEvent trigger 'FR-4.6:learner-withdraw'.
 */
export async function withdrawSessionRequest(
  learnerId: string,
  sessionId: string,
  client: PrismaClient = db,
) {
  return withWalletTransaction(client, async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new DomainError("NOT_FOUND", "الجلسة غير موجودة");
    }

    if (session.learnerId !== learnerId) {
      throw new DomainError("FORBIDDEN", "لا يمكنك إلغاء طلب لست صاحبه");
    }

    if (session.status !== "PENDING") {
      throw new DomainError(
        "INVALID_STATUS",
        "لا يمكن سحب هذا الطلب لأنه لم يعد معلّقاً",
      );
    }

    const now = new Date();
    const res = await tx.session.updateMany({
      where: {
        id: session.id,
        status: "PENDING",
        learnerId,
      },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        cancelledById: learnerId,
        cancelReason: "سحب الطلب من قبل المتعلم قبل رد المدرّس",
      },
    });

    if (res.count === 0) {
      throw new DomainError("CONFLICT", "تغيرت حالة هذا الطلب مسبقاً");
    }

    if (session.kind === "DIRECT") {
      await refundSessionEscrow(tx, {
        learnerId: session.learnerId,
        sessionId: session.id,
        durationMinutes: session.durationMinutes,
        actorId: learnerId,
        memo: "FR-2.4: استرجاع الرصيد لسحب المتعلم طلب الجلسة قبل قبوله",
      });
    }

    await tx.sessionEvent.create({
      data: {
        sessionId: session.id,
        fromStatus: "PENDING",
        toStatus: "CANCELLED",
        trigger: "FR-4.6:learner-withdraw",
        actorId: learnerId,
        note: "سحب الطلب من قبل المتعلم",
      },
    });

    return tx.session.findUniqueOrThrow({
      where: { id: session.id },
    });
  });
}

/**
 * Returns organized lists of sessions for a user:
 * - incomingRequests: sessions where user is teacher and status is PENDING
 * - outgoingRequests: sessions where user is learner and status is PENDING
 * - upcomingSessions: sessions where status is ACCEPTED (sorted by startAt asc)
 * - pastSessions: sessions in terminal or ended states (ENDED, RELEASED, CANCELLED, REJECTED, etc.)
 */
export async function getUserSessions(userId: string, client: PrismaClient = db) {
  const sessions = await client.session.findMany({
    where: {
      OR: [{ teacherId: userId }, { learnerId: userId }],
    },
    include: {
      teacher: { select: { id: true, displayName: true, avatarUrl: true, timezone: true } },
      learner: { select: { id: true, displayName: true, avatarUrl: true, timezone: true } },
      skill: { include: { category: true } },
      barterCycle: true,
      rating: true,
      quiz: true,
    },
    orderBy: { startAt: "desc" },
  });

  const incomingRequests = sessions.filter(
    (s) => s.teacherId === userId && s.status === "PENDING",
  );
  const outgoingRequests = sessions.filter(
    (s) => s.learnerId === userId && s.status === "PENDING",
  );
  const upcomingSessions = sessions
    .filter((s) => s.status === "ACCEPTED" || s.status === "IN_PROGRESS")
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const pastSessions = sessions.filter(
    (s) => s.status !== "PENDING" && s.status !== "ACCEPTED" && s.status !== "IN_PROGRESS",
  );

  return {
    incomingRequests,
    outgoingRequests,
    upcomingSessions,
    pastSessions,
    allSessions: sessions,
  };
}

export type UserSessionRecord = Awaited<ReturnType<typeof getUserSessions>>["allSessions"][number];

