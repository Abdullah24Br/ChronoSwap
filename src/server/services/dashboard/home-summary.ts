import type { PrismaClient } from "@/generated/prisma/client";
import type { SessionStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { getBarterOverview } from "@/server/services/barter/barter-overview";
import { ARCHIVED_STATUSES } from "@/server/services/sessions/archive-service";
import { getUserSessions } from "@/server/services/sessions/booking-service";

/** Something the user should do next, most urgent first. */
export type AttentionItem =
  | { kind: "debt"; minutes: number }
  | { kind: "incoming-requests"; count: number }
  | { kind: "quiz"; sessionId: string; skillNameAr: string }
  | { kind: "rate"; sessionId: string; skillNameAr: string; teacherName: string }
  | { kind: "barter-respond"; count: number }
  | { kind: "barter-book"; count: number };

export interface NextSession {
  id: string;
  role: "teacher" | "learner";
  partnerName: string;
  skillNameAr: string;
  startAt: Date;
  durationMinutes: number;
  status: SessionStatus;
  kind: "DIRECT" | "BARTER";
}

export interface HomeSummary {
  displayName: string;
  wallet: { availableMinutes: number; frozenMinutes: number; debtMinutes: number };
  attention: AttentionItem[];
  nextSessions: NextSession[];
  pendingOutgoingCount: number;
  stats: {
    /** Minutes of sessions that took place with the user as teacher / as learner (FR-5.5 statuses). */
    taughtMinutes: number;
    learnedMinutes: number;
    taughtCount: number;
    learnedCount: number;
    /** FR-6.2: average stars as a teacher, null until the first rating. */
    rating: { average: number; count: number } | null;
    skillsOffered: number;
    skillsWanted: number;
  };
}

const TOOK_PLACE = new Set<SessionStatus>(ARCHIVED_STATUSES);
/** Q-15: the learner rates once the session ended (disputes included, no-shows excluded). */
const RATEABLE = new Set<SessionStatus>(ARCHIVED_STATUSES);

/**
 * The signed-in home page: balances, what needs the user's action, the next sessions and a
 * summary of everything done so far. Read-only; every query is filtered by the user's id.
 */
export async function getHomeSummary(userId: string, client: PrismaClient = db): Promise<HomeSummary> {
  const [user, wallet, sessions, barter, skillCounts] = await Promise.all([
    client.user.findUniqueOrThrow({
      where: { id: userId },
      select: { displayName: true, ratingCount: true, ratingSum: true },
    }),
    client.wallet.findUnique({ where: { userId } }), // read-only: no wallet yet = zero balances
    getUserSessions(userId, client),
    getBarterOverview(userId, client),
    client.userSkill.groupBy({ by: ["kind"], where: { userId }, _count: { _all: true } }),
  ]);

  let taughtMinutes = 0;
  let learnedMinutes = 0;
  let taughtCount = 0;
  let learnedCount = 0;
  for (const s of sessions.allSessions) {
    if (!TOOK_PLACE.has(s.status)) continue;
    if (s.teacherId === userId) {
      taughtMinutes += s.durationMinutes;
      taughtCount += 1;
    } else {
      learnedMinutes += s.durationMinutes;
      learnedCount += 1;
    }
  }

  const attention: AttentionItem[] = [];
  const debtMinutes = wallet?.debtMinutes ?? 0;
  if (debtMinutes > 0) attention.push({ kind: "debt", minutes: debtMinutes });
  if (sessions.incomingRequests.length > 0) {
    attention.push({ kind: "incoming-requests", count: sessions.incomingRequests.length });
  }
  for (const s of sessions.allSessions) {
    if (s.learnerId !== userId) continue;
    if (s.status === "QUIZ_PENDING") {
      attention.push({ kind: "quiz", sessionId: s.id, skillNameAr: s.skill.nameAr });
    } else if (RATEABLE.has(s.status) && !s.rating) {
      attention.push({ kind: "rate", sessionId: s.id, skillNameAr: s.skill.nameAr, teacherName: s.teacher.displayName });
    }
  }
  const toRespond = barter.cycles.filter((c) => c.canRespond).length;
  if (toRespond > 0) attention.push({ kind: "barter-respond", count: toRespond });
  const toBook = barter.cycles.filter((c) => c.bookMyLeg !== null).length;
  if (toBook > 0) attention.push({ kind: "barter-book", count: toBook });

  const nextSessions: NextSession[] = sessions.upcomingSessions.slice(0, 3).map((s) => {
    const iTeach = s.teacherId === userId;
    return {
      id: s.id,
      role: iTeach ? "teacher" : "learner",
      partnerName: iTeach ? s.learner.displayName : s.teacher.displayName,
      skillNameAr: s.skill.nameAr,
      startAt: s.startAt,
      durationMinutes: s.durationMinutes,
      status: s.status,
      kind: s.kind,
    };
  });

  const countOf = (kind: "OFFERED" | "WANTED") => skillCounts.find((c) => c.kind === kind)?._count._all ?? 0;

  return {
    displayName: user.displayName,
    wallet: {
      availableMinutes: wallet?.availableMinutes ?? 0,
      frozenMinutes: wallet?.frozenMinutes ?? 0,
      debtMinutes: wallet?.debtMinutes ?? 0,
    },
    attention,
    nextSessions,
    pendingOutgoingCount: sessions.outgoingRequests.length,
    stats: {
      taughtMinutes,
      learnedMinutes,
      taughtCount,
      learnedCount,
      rating:
        user.ratingCount > 0
          ? { average: Math.round((user.ratingSum / user.ratingCount) * 10) / 10, count: user.ratingCount }
          : null,
      skillsOffered: countOf("OFFERED"),
      skillsWanted: countOf("WANTED"),
    },
  };
}
