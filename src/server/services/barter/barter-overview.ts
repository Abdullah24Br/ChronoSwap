import type { PrismaClient } from "@/generated/prisma/client";
import type { BarterCycleStatus, BarterDecision, SessionStatus } from "@/generated/prisma/enums";
import { z } from "zod";
import { db } from "@/server/db";
import { getUserBarterCycles, hasOutstandingDebt } from "./barter-service";

/** Request statuses after which the pair has no session in the cycle (it can never be re-booked). */
const VOID_STATUSES: SessionStatus[] = ["REJECTED", "AUTO_REJECTED", "CANCELLED"];

export interface BarterOverviewParticipant {
  userId: string;
  displayName: string;
  position: number;
  decision: BarterDecision;
  teachesSkill: { id: string; nameAr: string };
  isMe: boolean;
}

export interface BarterOverviewLeg {
  /** position p teaches position (p + 1) % 3 */
  teacher: { id: string; displayName: string };
  learner: { id: string; displayName: string };
  skill: { id: string; nameAr: string };
  session: { id: string; status: SessionStatus; startAt: Date } | null;
  /** The request for this leg was rejected or cancelled; the pair cannot book again (one session per teacher per cycle). */
  voided: boolean;
}

export interface BarterOverviewCycle {
  id: string;
  status: BarterCycleStatus;
  durationMinutes: number;
  proposedAt: Date;
  respondByAt: Date;
  scheduleByAt: Date | null;
  participants: BarterOverviewParticipant[];
  legs: BarterOverviewLeg[];
  myDecision: BarterDecision;
  /** FR-3.4: I still have to accept or decline the proposal. */
  canRespond: boolean;
  /** FR-3.4 / Q-20: the leg where I am the learner, if I still need to send its booking request. */
  bookMyLeg: { teacherId: string; skillId: string } | null;
}

export interface BarterOverview {
  inDebt: boolean;
  cycles: BarterOverviewCycle[];
}

/**
 * FR-3.4: Everything the /barter page needs about the user's cycles, already shaped per leg.
 * Read-only; authorization = only cycles where the user is a participant are returned.
 */
export async function getBarterOverview(
  userId: string,
  client: PrismaClient = db,
  now: Date = new Date(),
): Promise<BarterOverview> {
  const [cycles, inDebt] = await Promise.all([
    getUserBarterCycles(userId, client),
    hasOutstandingDebt(userId, client),
  ]);

  return {
    inDebt,
    cycles: cycles.map((cycle) => {
      const participants = [...cycle.participants].sort((a, b) => a.position - b.position);
      const me = participants.find((p) => p.userId === userId);

      const legs: BarterOverviewLeg[] = participants.map((p) => {
        const learner = participants.find((q) => q.position === (p.position + 1) % 3) ?? p;
        const sessions = cycle.sessions.filter(
          (s) => s.teacherId === p.userId && s.learnerId === learner.userId,
        );
        // Q-18: the live request wins; otherwise show the latest (rejected / cancelled) one.
        const session =
          sessions.find((s) => !VOID_STATUSES.includes(s.status)) ?? sessions[0] ?? null;
        return {
          teacher: { id: p.userId, displayName: p.user.displayName },
          learner: { id: learner.userId, displayName: learner.user.displayName },
          skill: { id: p.teachesSkillId, nameAr: p.teachesSkill.nameAr },
          session: session
            ? { id: session.id, status: session.status, startAt: session.startAt }
            : null,
          voided: session !== null && VOID_STATUSES.includes(session.status),
        };
      });

      const myLeg = legs.find((l) => l.learner.id === userId);
      const beforeDeadline = cycle.scheduleByAt === null || now <= cycle.scheduleByAt;
      const bookMyLeg =
        cycle.status === "ACTIVE" &&
        beforeDeadline &&
        myLeg &&
        (myLeg.session === null || myLeg.voided) && // Q-18: a rejected leg can be re-booked
        !inDebt
          ? { teacherId: myLeg.teacher.id, skillId: myLeg.skill.id }
          : null;

      return {
        id: cycle.id,
        status: cycle.status,
        durationMinutes: cycle.durationMinutes,
        proposedAt: cycle.proposedAt,
        respondByAt: cycle.respondByAt,
        scheduleByAt: cycle.scheduleByAt,
        participants: participants.map((p) => ({
          userId: p.userId,
          displayName: p.user.displayName,
          position: p.position,
          decision: p.decision,
          teachesSkill: { id: p.teachesSkillId, nameAr: p.teachesSkill.nameAr },
          isMe: p.userId === userId,
        })),
        legs,
        myDecision: me?.decision ?? "PENDING",
        canRespond: cycle.status === "PROPOSED" && me?.decision === "PENDING",
        bookMyLeg,
      };
    }),
  };
}

export interface BarterBookingContext {
  cycleId: string;
  skillId: string;
  durationMinutes: 30 | 60 | 90 | 120;
}

/**
 * FR-3.4 / Q-20: checks that `learnerId` may book `teacherId` inside `cycleId` (ACTIVE cycle,
 * the teacher sits just before the learner in the cycle) and returns the cycle's fixed skill and
 * duration. Returns null otherwise. requestSession() re-validates all of this on submit.
 */
export async function getBarterBookingContext(
  learnerId: string,
  cycleId: string,
  teacherId: string,
  client: PrismaClient = db,
): Promise<BarterBookingContext | null> {
  const parsed = z.uuid().safeParse(cycleId);
  if (!parsed.success) return null;

  const cycle = await client.barterCycle.findUnique({
    where: { id: parsed.data },
    include: { participants: true },
  });
  if (!cycle || cycle.status !== "ACTIVE") return null;

  const learner = cycle.participants.find((p) => p.userId === learnerId);
  const teacher = cycle.participants.find((p) => p.userId === teacherId);
  if (!learner || !teacher || (teacher.position + 1) % 3 !== learner.position) return null;

  const duration = cycle.durationMinutes;
  if (duration !== 30 && duration !== 60 && duration !== 90 && duration !== 120) return null;

  return { cycleId: cycle.id, skillId: teacher.teachesSkillId, durationMinutes: duration };
}
