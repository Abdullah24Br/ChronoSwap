import type { PrismaClient } from "@/generated/prisma/client";
import { SESSION_DURATIONS, type SessionDuration } from "@/lib/rules";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import {
  postLedgerEntries,
  withWalletTransaction,
  type LedgerPosting,
  type Tx,
} from "@/server/services/wallet/ledger";
import { ensureWallet } from "@/server/services/wallet/wallet-service";
import type {
  ProposeBarterCycleInput,
  RespondBarterProposalInput,
} from "./schemas";

export interface MatchedSkillInfo {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string | null;
  categoryNameAr: string;
}

export interface DirectBarterMatch {
  partner: {
    id: string;
    displayName: string;
    bio: string | null;
    avatarUrl: string | null;
    timezone: string;
    ratingCount: number;
    ratingSum: number;
    averageRating: number;
    availabilitySlots: {
      weekday: number;
      startMinute: number;
      endMinute: number;
      timezone: string;
    }[];
  };
  theyTeachYou: MatchedSkillInfo[];
  youTeachThem: MatchedSkillInfo[];
}

export interface DirectMatchesResult {
  matches: DirectBarterMatch[];
  userOfferedCount: number;
  userWantedCount: number;
}

/**
 * FR-3.2: Direct Barter Matching.
 * Finds other users where:
 * 1. They OFFER at least one skill that the current user WANTS.
 * 2. They WANT at least one skill that the current user OFFERS.
 *
 * This allows a direct mutual 1-to-1 skill exchange without requiring any prior balance.
 */
export async function findDirectMatches(
  userId: string,
  client: PrismaClient = db,
): Promise<DirectMatchesResult> {
  // 1. Fetch user's offered and wanted skills
  const mySkills = await client.userSkill.findMany({
    where: { userId },
    select: {
      skillId: true,
      kind: true,
    },
  });

  const offeredSkillIds = mySkills
    .filter((s) => s.kind === "OFFERED")
    .map((s) => s.skillId);

  const wantedSkillIds = mySkills
    .filter((s) => s.kind === "WANTED")
    .map((s) => s.skillId);

  // If user does not offer skills or does not want any skills, direct match is not possible
  if (offeredSkillIds.length === 0 || wantedSkillIds.length === 0) {
    return {
      matches: [],
      userOfferedCount: offeredSkillIds.length,
      userWantedCount: wantedSkillIds.length,
    };
  }

  // 2. Query other users who satisfy the mutual barter condition:
  // (Partner offers something in user's wanted list) AND (Partner wants something in user's offered list)
  const candidateUsers = await client.user.findMany({
    where: {
      id: { not: userId },
      role: "USER",
      emailVerifiedAt: { not: null },
      AND: [
        {
          skills: {
            some: {
              kind: "OFFERED",
              skillId: { in: wantedSkillIds },
            },
          },
        },
        {
          skills: {
            some: {
              kind: "WANTED",
              skillId: { in: offeredSkillIds },
            },
          },
        },
      ],
    },
    include: {
      skills: {
        where: {
          OR: [
            { kind: "OFFERED", skillId: { in: wantedSkillIds } },
            { kind: "WANTED", skillId: { in: offeredSkillIds } },
          ],
        },
        include: {
          skill: {
            include: {
              category: true,
            },
          },
        },
      },
      availability: {
        orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
      },
    },
  });

  // 3. Map candidates to structured match objects
  const matches: DirectBarterMatch[] = candidateUsers.map((u) => {
    const averageRating =
      u.ratingCount > 0 ? Number((u.ratingSum / u.ratingCount).toFixed(1)) : 0;

    const theyTeachYou: MatchedSkillInfo[] = u.skills
      .filter((us) => us.kind === "OFFERED" && wantedSkillIds.includes(us.skillId))
      .map((us) => ({
        id: us.skill.id,
        slug: us.skill.slug,
        nameAr: us.skill.nameAr,
        nameEn: us.skill.nameEn,
        categoryNameAr: us.skill.category.nameAr,
      }));

    const youTeachThem: MatchedSkillInfo[] = u.skills
      .filter((us) => us.kind === "WANTED" && offeredSkillIds.includes(us.skillId))
      .map((us) => ({
        id: us.skill.id,
        slug: us.skill.slug,
        nameAr: us.skill.nameAr,
        nameEn: us.skill.nameEn,
        categoryNameAr: us.skill.category.nameAr,
      }));

    return {
      partner: {
        id: u.id,
        displayName: u.displayName,
        bio: u.bio,
        avatarUrl: u.avatarUrl,
        timezone: u.timezone,
        ratingCount: u.ratingCount,
        ratingSum: u.ratingSum,
        averageRating,
        availabilitySlots: u.availability.map((s) => ({
          weekday: s.weekday,
          startMinute: s.startMinute,
          endMinute: s.endMinute,
          timezone: s.timezone,
        })),
      },
      theyTeachYou,
      youTeachThem,
    };
  });

  // Sort matches: most balanced/shared skills first, then highest rated
  matches.sort((a, b) => {
    const totalSkillsA = a.theyTeachYou.length + a.youTeachThem.length;
    const totalSkillsB = b.theyTeachYou.length + b.youTeachThem.length;
    if (totalSkillsB !== totalSkillsA) {
      return totalSkillsB - totalSkillsA;
    }
    if (b.partner.averageRating !== a.partner.averageRating) {
      return b.partner.averageRating - a.partner.averageRating;
    }
    return a.partner.displayName.localeCompare(b.partner.displayName, "ar");
  });

  return {
    matches,
    userOfferedCount: offeredSkillIds.length,
    userWantedCount: wantedSkillIds.length,
  };
}

export interface CycleParticipantInfo {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  ratingCount: number;
  averageRating: number;
  teachesSkill: MatchedSkillInfo;
}

export interface ThreeWayCycleMatch {
  id: string;
  participants: [CycleParticipantInfo, CycleParticipantInfo, CycleParticipantInfo];
  myRole: {
    iTeach: {
      user: { id: string; displayName: string };
      skill: MatchedSkillInfo;
    };
    iLearnFrom: {
      user: { id: string; displayName: string };
      skill: MatchedSkillInfo;
    };
  };
}

export interface ThreeWayCyclesResult {
  cycles: ThreeWayCycleMatch[];
  userOfferedCount: number;
  userWantedCount: number;
}

/**
 * FR-3.3: 3-Way Closed Barter Cycle Engine.
 * Constructs a directed graph where X -> Y means X offers a skill Y wants.
 * Finds closed 3-cycles A -> B -> C -> A where:
 * - A teaches B (using skill s1)
 * - B teaches C (using skill s2)
 * - C teaches A (using skill s3)
 * Allows equal 3-way time banking exchange without prior balances.
 */
export async function findThreeWayCycles(
  userId: string,
  client: PrismaClient = db,
): Promise<ThreeWayCyclesResult> {
  // 1. Fetch User A's offered and wanted skills with details
  const myUser = await client.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      ratingCount: true,
      ratingSum: true,
      skills: {
        include: {
          skill: {
            include: { category: true },
          },
        },
      },
    },
  });

  if (!myUser) {
    return { cycles: [], userOfferedCount: 0, userWantedCount: 0 };
  }

  const myOffered = myUser.skills.filter((s) => s.kind === "OFFERED");
  const myWanted = myUser.skills.filter((s) => s.kind === "WANTED");

  const myOfferedIds = myOffered.map((s) => s.skillId);
  const myWantedIds = myWanted.map((s) => s.skillId);

  if (myOfferedIds.length === 0 || myWantedIds.length === 0) {
    return {
      cycles: [],
      userOfferedCount: myOfferedIds.length,
      userWantedCount: myWantedIds.length,
    };
  }

  const myAvgRating =
    myUser.ratingCount > 0
      ? Number((myUser.ratingSum / myUser.ratingCount).toFixed(1))
      : 0;

  // 2. Find candidate users B who want at least one skill User A offers (A -> B)
  const candidateBs = await client.user.findMany({
    where: {
      id: { not: userId },
      role: "USER",
      emailVerifiedAt: { not: null },
      skills: {
        some: {
          kind: "WANTED",
          skillId: { in: myOfferedIds },
        },
      },
    },
    include: {
      skills: {
        include: {
          skill: {
            include: { category: true },
          },
        },
      },
    },
  });

  // 3. Find candidate users C who offer at least one skill User A wants (C -> A)
  const candidateCs = await client.user.findMany({
    where: {
      id: { not: userId },
      role: "USER",
      emailVerifiedAt: { not: null },
      skills: {
        some: {
          kind: "OFFERED",
          skillId: { in: myWantedIds },
        },
      },
    },
    include: {
      skills: {
        include: {
          skill: {
            include: { category: true },
          },
        },
      },
    },
  });

  const seenCycleKeys = new Set<string>();
  const cycles: ThreeWayCycleMatch[] = [];

  // 4. For each B and C pair, check if B offers something C wants (B -> C)
  for (const b of candidateBs) {
    const bOffered = b.skills.filter((s) => s.kind === "OFFERED");
    if (bOffered.length === 0) continue;
    const bOfferedMap = new Map(bOffered.map((s) => [s.skillId, s.skill]));

    // Find the skill A teaches B: s1 in (myOfferedIds ∩ bWantedIds)
    const bWantedMatchingA = b.skills.find(
      (s) => s.kind === "WANTED" && myOfferedIds.includes(s.skillId),
    );
    if (!bWantedMatchingA) continue;
    const s1 = bWantedMatchingA.skill;

    for (const c of candidateCs) {
      // Must be 3 distinct users (A != B, B != C, C != A)
      if (c.id === b.id) continue;

      // Check if B offers something C wants: s2 in (bOfferedIds ∩ cWantedIds)
      const cWantedMatchingB = c.skills.find(
        (s) => s.kind === "WANTED" && bOfferedMap.has(s.skillId),
      );
      if (!cWantedMatchingB) continue;
      const s2 = bOfferedMap.get(cWantedMatchingB.skillId)!;

      // Find the skill C teaches A: s3 in (cOfferedIds ∩ myWantedIds)
      const cOfferedMatchingA = c.skills.find(
        (s) => s.kind === "OFFERED" && myWantedIds.includes(s.skillId),
      );
      if (!cOfferedMatchingA) continue;
      const s3 = cOfferedMatchingA.skill;

      // Deduplicate cycle
      const cycleKey = `${b.id}:${c.id}:${s1.id}:${s2.id}:${s3.id}`;
      if (seenCycleKeys.has(cycleKey)) continue;
      seenCycleKeys.add(cycleKey);

      const bAvgRating =
        b.ratingCount > 0
          ? Number((b.ratingSum / b.ratingCount).toFixed(1))
          : 0;

      const cAvgRating =
        c.ratingCount > 0
          ? Number((c.ratingSum / c.ratingCount).toFixed(1))
          : 0;

      const participantA: CycleParticipantInfo = {
        userId: myUser.id,
        displayName: myUser.displayName,
        avatarUrl: myUser.avatarUrl,
        ratingCount: myUser.ratingCount,
        averageRating: myAvgRating,
        teachesSkill: {
          id: s1.id,
          slug: s1.slug,
          nameAr: s1.nameAr,
          nameEn: s1.nameEn,
          categoryNameAr: s1.category.nameAr,
        },
      };

      const participantB: CycleParticipantInfo = {
        userId: b.id,
        displayName: b.displayName,
        avatarUrl: b.avatarUrl,
        ratingCount: b.ratingCount,
        averageRating: bAvgRating,
        teachesSkill: {
          id: s2.id,
          slug: s2.slug,
          nameAr: s2.nameAr,
          nameEn: s2.nameEn,
          categoryNameAr: s2.category.nameAr,
        },
      };

      const participantC: CycleParticipantInfo = {
        userId: c.id,
        displayName: c.displayName,
        avatarUrl: c.avatarUrl,
        ratingCount: c.ratingCount,
        averageRating: cAvgRating,
        teachesSkill: {
          id: s3.id,
          slug: s3.slug,
          nameAr: s3.nameAr,
          nameEn: s3.nameEn,
          categoryNameAr: s3.category.nameAr,
        },
      };

      cycles.push({
        id: `cycle:${myUser.id}:${b.id}:${c.id}`,
        participants: [participantA, participantB, participantC],
        myRole: {
          iTeach: {
            user: { id: b.id, displayName: b.displayName },
            skill: participantA.teachesSkill,
          },
          iLearnFrom: {
            user: { id: c.id, displayName: c.displayName },
            skill: participantC.teachesSkill,
          },
        },
      });
    }
  }

  // Sort cycles by cumulative participant rating descending
  cycles.sort((c1, c2) => {
    const score1 =
      c1.participants[0].averageRating +
      c1.participants[1].averageRating +
      c1.participants[2].averageRating;
    const score2 =
      c2.participants[0].averageRating +
      c2.participants[1].averageRating +
      c2.participants[2].averageRating;
    return score2 - score1;
  });

  return {
    cycles,
    userOfferedCount: myOfferedIds.length,
    userWantedCount: myWantedIds.length,
  };
}

// ─────────────────────────────────────────────────────────────
// Barter cycle proposal & execution (FR-3.4)
// ─────────────────────────────────────────────────────────────

/**
 * FR-3.4 / Q-16: Checks whether a user has any outstanding debt minutes.
 * Users in debt cannot initiate or accept barter cycle proposals, nor request sessions.
 */
export async function hasOutstandingDebt(
  userId: string,
  client: PrismaClient | Tx = db,
): Promise<boolean> {
  const wallet = await client.wallet.findUnique({
    where: { userId },
    select: { debtMinutes: true },
  });
  return (wallet?.debtMinutes ?? 0) > 0;
}

/**
 * FR-3.4: Propose a 3-way barter cycle.
 * Initiator selects the duration (30, 60, 90, 120 minutes) and the 3 participants (A -> B -> C -> A).
 * - Position 0 teaches position 1 using participant[0].teachesSkillId.
 * - Position 1 teaches position 2 using participant[1].teachesSkillId.
 * - Position 2 teaches position 0 using participant[2].teachesSkillId.
 *
 * Initiator's decision is automatically ACCEPTED.
 * The other two participants' decisions are set to PENDING.
 * Cycle status is PROPOSED with a 72-hour respond deadline (Q-18).
 */
export async function proposeBarterCycle(
  initiatorId: string,
  input: ProposeBarterCycleInput,
  client: PrismaClient = db,
) {
  // 1. Validate duration
  if (!SESSION_DURATIONS.includes(input.durationMinutes as SessionDuration)) {
    throw new DomainError(
      "INVALID_DURATION",
      "مدة جلسات المقايضة يجب أن تكون 30 أو 60 أو 90 أو 120 دقيقة",
    );
  }

  // 2. Validate participants count and uniqueness
  if (input.participants.length !== 3) {
    throw new DomainError("INVALID_PARTICIPANTS", "يجب أن تضم الحلقة 3 مشاركين بالضبط");
  }

  const participantUserIds = input.participants.map((p) => p.userId);
  const uniqueUserIds = new Set(participantUserIds);
  if (uniqueUserIds.size !== 3) {
    throw new DomainError("DUPLICATE_PARTICIPANTS", "لا يمكن تكرار المستخدم في نفس الحلقة");
  }

  if (!participantUserIds.includes(initiatorId)) {
    throw new DomainError(
      "INITIATOR_NOT_PARTICIPANT",
      "يجب أن يكون منشئ الطلب أحد أطراف المقايضة الثلاثة",
    );
  }

  // 3. Check outstanding debts (FR-3.4 / Q-16)
  for (const uid of participantUserIds) {
    const inDebt = await hasOutstandingDebt(uid, client);
    if (inDebt) {
      throw new DomainError(
        "USER_IN_DEBT",
        uid === initiatorId
          ? "لديك ديون سابقة غير مسددة تمنعك من بدء دورة مقايضة جديدة"
          : "أحد أطراف المقايضة لديه ديون سابقة غير مسددة ولا يمكنه المشاركة",
      );
    }
  }

  // 4. Verify each user actually offers their teachesSkillId
  for (const p of input.participants) {
    const offered = await client.userSkill.findFirst({
      where: {
        userId: p.userId,
        skillId: p.teachesSkillId,
        kind: "OFFERED",
      },
    });
    if (!offered) {
      throw new DomainError(
        "SKILL_NOT_OFFERED",
        "المستخدم لا يعرض المهارة المحددة للتدريس",
      );
    }
  }

  // 5. Create BarterCycle and BarterParticipants
  const now = new Date();
  const respondByAt = new Date(now.getTime() + 72 * 60 * 60 * 1000); // 72h per Q-18

  const cycle = await client.barterCycle.create({
    data: {
      status: "PROPOSED",
      durationMinutes: input.durationMinutes,
      initiatorId,
      proposedAt: now,
      respondByAt,
      participants: {
        create: input.participants.map((p, idx) => ({
          userId: p.userId,
          position: idx,
          teachesSkillId: p.teachesSkillId,
          decision: p.userId === initiatorId ? "ACCEPTED" : "PENDING",
          decidedAt: p.userId === initiatorId ? now : null,
        })),
      },
    },
    include: {
      participants: {
        include: {
          user: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
          teachesSkill: {
            include: { category: true },
          },
        },
        orderBy: { position: "asc" },
      },
    },
  });

  return cycle;
}

/**
 * FR-3.4: Respond to a proposed barter cycle (accept or decline).
 * - If DECLINED: Cycle moves to DECLINED and ends immediately.
 * - If ACCEPTED: If all 3 participants accept, cycle moves to ACTIVE with a 14-day schedule deadline (Q-18).
 */
export async function respondToBarterProposal(
  userId: string,
  input: RespondBarterProposalInput,
  client: PrismaClient = db,
) {
  return client.$transaction(async (tx) => {
    const cycle = await tx.barterCycle.findUnique({
      where: { id: input.cycleId },
      include: {
        participants: {
          orderBy: { position: "asc" },
        },
      },
    });

    if (!cycle) {
      throw new DomainError("NOT_FOUND", "دورة المقايضة غير موجودة");
    }

    if (cycle.status !== "PROPOSED") {
      throw new DomainError(
        "INVALID_CYCLE_STATUS",
        "لا يمكن الرد على دورة مقايضة غير مقترحة أو منتهية",
      );
    }

    const now = new Date();
    if (now > cycle.respondByAt) {
      await tx.barterCycle.update({
        where: { id: cycle.id },
        data: { status: "EXPIRED", resolvedAt: now },
      });
      throw new DomainError("CYCLE_EXPIRED", "انتهت مهلة الرد على اقتراح المقايضة (72 ساعة)");
    }

    const participant = cycle.participants.find((p) => p.userId === userId);
    if (!participant) {
      throw new DomainError("NOT_PARTICIPANT", "المستخدم ليس طرفاً في دورة المقايضة هذه");
    }

    if (participant.decision !== "PENDING") {
      throw new DomainError("ALREADY_DECIDED", "لقد تم تسجيل ردك على هذا الاقتراح مسبقاً");
    }

    if (input.decision === "ACCEPTED") {
      const inDebt = await hasOutstandingDebt(userId, tx);
      if (inDebt) {
        throw new DomainError(
          "USER_IN_DEBT",
          "لديك ديون سابقة غير مسددة تمنعك من قبول دورة المقايضة",
        );
      }
    }

    await tx.barterParticipant.update({
      where: { id: participant.id },
      data: {
        decision: input.decision,
        decidedAt: now,
      },
    });

    if (input.decision === "DECLINED") {
      const updatedCycle = await tx.barterCycle.update({
        where: { id: cycle.id },
        data: {
          status: "DECLINED",
          resolvedAt: now,
        },
        include: {
          participants: {
            include: {
              user: { select: { id: true, displayName: true, avatarUrl: true } },
              teachesSkill: { include: { category: true } },
            },
            orderBy: { position: "asc" },
          },
        },
      });
      return updatedCycle;
    }

    // Check if all participants have accepted
    const otherParticipants = cycle.participants.filter((p) => p.id !== participant.id);
    const allOthersAccepted = otherParticipants.every((p) => p.decision === "ACCEPTED");

    if (allOthersAccepted) {
      const scheduleByAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days per Q-18
      const updatedCycle = await tx.barterCycle.update({
        where: { id: cycle.id },
        data: {
          status: "ACTIVE",
          activatedAt: now,
          scheduleByAt,
        },
        include: {
          participants: {
            include: {
              user: { select: { id: true, displayName: true, avatarUrl: true } },
              teachesSkill: { include: { category: true } },
            },
            orderBy: { position: "asc" },
          },
        },
      });
      return updatedCycle;
    }

    const updatedCycle = await tx.barterCycle.findUniqueOrThrow({
      where: { id: cycle.id },
      include: {
        participants: {
          include: {
            user: { select: { id: true, displayName: true, avatarUrl: true } },
            teachesSkill: { include: { category: true } },
          },
          orderBy: { position: "asc" },
        },
      },
    });

    return updatedCycle;
  });
}

export interface SettleFailedBarterSessionOpts {
  sessionId: string;
  actorId?: string;
  memo?: string;
}

/**
 * FR-3.4: Settle a completed session from a failed barter cycle.
 * - Deducts duration from learner's available balance.
 * - Any shortfall becomes a Debt record (and increases wallet.debtMinutes).
 * - Credits teacher duration: repays teacher's existing debts FIFO first, remainder to available.
 * - Updates session status to RELEASED and marks barter cycle as FAILED.
 * - Fully idempotent: replaying with the same sessionId returns applied: false.
 */
export async function settleFailedBarterCycleSession(
  tx: Tx,
  opts: SettleFailedBarterSessionOpts,
) {
  const session = await tx.session.findUnique({
    where: { id: opts.sessionId },
    include: { barterCycle: true },
  });

  if (!session) {
    throw new DomainError("NOT_FOUND", "الجلسة غير موجودة");
  }

  if (session.kind !== "BARTER" || !session.barterCycleId) {
    throw new DomainError("NOT_BARTER_SESSION", "هذه الجلسة ليست تابعة لدورة مقايضة");
  }

  const debitKey = `barter-settle:${session.id}:debit`;
  const creditKey = `barter-settle:${session.id}:credit`;

  // Idempotency check: already settled
  if (session.settledAt !== null) {
    const existingDebit = await tx.ledgerEntry.findUnique({
      where: { idempotencyKey: debitKey },
    });
    const existingCredit = await tx.ledgerEntry.findUnique({
      where: { idempotencyKey: creditKey },
    });
    return {
      applied: false,
      session,
      entries: [existingDebit, existingCredit].filter((e): e is NonNullable<typeof e> => e !== null),
      debtCreatedMinutes: 0,
      debtRepaidMinutes: 0,
    };
  }

  // Ensure wallets exist
  const learnerWallet = await ensureWallet(tx, session.learnerId);
  await ensureWallet(tx, session.teacherId);

  // 1. Learner settlement: deduct from available, rest becomes debt
  const availableDebit = Math.min(
    Math.max(learnerWallet.availableMinutes, 0),
    session.durationMinutes,
  );
  const shortfallDebt = session.durationMinutes - availableDebit;

  if (shortfallDebt > 0) {
    await tx.debt.create({
      data: {
        userId: session.learnerId,
        sessionId: session.id,
        originalMinutes: shortfallDebt,
        remainingMinutes: shortfallDebt,
      },
    });
  }

  // 2. Teacher settlement: repay teacher debts FIFO first, rest to available
  const teacherDebts = await tx.debt.findMany({
    where: {
      userId: session.teacherId,
      remainingMinutes: { gt: 0 },
    },
    orderBy: { createdAt: "asc" },
  });

  let teacherDebtRepaid = 0;
  let remainingTeacherCredit = session.durationMinutes;

  for (const debt of teacherDebts) {
    if (remainingTeacherCredit <= 0) break;
    const repay = Math.min(debt.remainingMinutes, remainingTeacherCredit);
    const newRemaining = debt.remainingMinutes - repay;
    await tx.debt.update({
      where: { id: debt.id },
      data: {
        remainingMinutes: newRemaining,
        settledAt: newRemaining === 0 ? new Date() : null,
      },
    });
    teacherDebtRepaid += repay;
    remainingTeacherCredit -= repay;
  }

  // 3. Post atomic ledger entries
  const postings: LedgerPosting[] = [
    {
      userId: session.learnerId,
      type: "BARTER_SETTLEMENT_DEBIT",
      delta: {
        available: -availableDebit,
        debt: shortfallDebt,
      },
      sessionId: session.id,
      barterCycleId: session.barterCycleId,
      idempotencyKey: debitKey,
      actorId: opts.actorId,
      memo:
        opts.memo ??
        (shortfallDebt > 0
          ? `FR-3.4: تسوية جلسة مقايضة متعثرة (خصم ${availableDebit} متاح، تسجيل دين ${shortfallDebt} دقيقة)`
          : `FR-3.4: تسوية جلسة مقايضة متعثرة (خصم ${availableDebit} دقيقة من المتاح)`),
    },
    {
      userId: session.teacherId,
      type: "BARTER_SETTLEMENT_CREDIT",
      delta: {
        available: remainingTeacherCredit,
        debt: -teacherDebtRepaid,
      },
      sessionId: session.id,
      barterCycleId: session.barterCycleId,
      idempotencyKey: creditKey,
      actorId: opts.actorId,
      memo:
        opts.memo ??
        (teacherDebtRepaid > 0
          ? `FR-3.4: تسوية جلسة مقايضة متعثرة (إيداع ${remainingTeacherCredit} متاح، سداد دين ${teacherDebtRepaid} دقيقة)`
          : `FR-3.4: تسوية جلسة مقايضة متعثرة (إيداع ${remainingTeacherCredit} دقيقة في المتاح)`),
    },
  ];

  const { applied, entries } = await postLedgerEntries(tx, postings);

  const now = new Date();
  const updatedSession = await tx.session.update({
    where: { id: session.id },
    data: {
      status: "RELEASED",
      settledAt: now,
    },
  });

  await tx.sessionEvent.create({
    data: {
      sessionId: session.id,
      fromStatus: session.status,
      toStatus: "RELEASED",
      trigger: "FR-3.4:cycle-failed",
      actorId: opts.actorId,
      note: "تسوية جلسة المقايضة المكتملة بعد تعثر حلقة المقايضة",
    },
  });

  if (session.barterCycle && session.barterCycle.status !== "FAILED") {
    await tx.barterCycle.update({
      where: { id: session.barterCycleId },
      data: {
        status: "FAILED",
        resolvedAt: now,
      },
    });
  }

  return {
    applied,
    session: updatedSession,
    entries,
    debtCreatedMinutes: shortfallDebt,
    debtRepaidMinutes: teacherDebtRepaid,
  };
}

/**
 * Convenience transaction wrapper for settleFailedBarterCycleSession.
 */
export async function settleFailedBarterCycleSessionTx(
  client: PrismaClient,
  opts: SettleFailedBarterSessionOpts,
) {
  return withWalletTransaction(client, (tx) =>
    settleFailedBarterCycleSession(tx, opts),
  );
}

/**
 * FR-3.4: Marks a barter cycle as fully completed when all 3 sessions have completed.
 * All 3 sessions transition from BARTER_COMPLETED to BARTER_SETTLED with no ledger movements
 * (because equal time was exchanged, each gave and received identical hours).
 */
export async function completeSuccessfulBarterCycle(
  client: PrismaClient,
  cycleId: string,
) {
  return client.$transaction(async (tx) => {
    const cycle = await tx.barterCycle.findUnique({
      where: { id: cycleId },
      include: { sessions: true },
    });

    if (!cycle) {
      throw new DomainError("NOT_FOUND", "دورة المقايضة غير موجودة");
    }

    if (cycle.status !== "ACTIVE") {
      throw new DomainError("INVALID_CYCLE_STATUS", "دورة المقايضة ليست في حالة نشطة");
    }

    if (
      cycle.sessions.length !== 3 ||
      cycle.sessions.some((s) => s.status !== "BARTER_COMPLETED")
    ) {
      throw new DomainError(
        "CYCLE_NOT_COMPLETED",
        "لا يمكن إتمام الحلقة إلا بعد اكتمال جميع الجلسات الثلاث (BARTER_COMPLETED)",
      );
    }

    const now = new Date();
    for (const s of cycle.sessions) {
      await tx.session.update({
        where: { id: s.id },
        data: {
          status: "BARTER_SETTLED",
          settledAt: now,
        },
      });

      await tx.sessionEvent.create({
        data: {
          sessionId: s.id,
          fromStatus: "BARTER_COMPLETED",
          toStatus: "BARTER_SETTLED",
          trigger: "FR-3.4:cycle-completed",
          note: "اكتملت جميع جلسات حلقة المقايضة بنجاح دون الحاجة لتحويل رصيد",
        },
      });
    }

    const updatedCycle = await tx.barterCycle.update({
      where: { id: cycle.id },
      data: {
        status: "COMPLETED",
        resolvedAt: now,
      },
      include: {
        sessions: true,
        participants: {
          include: {
            user: { select: { id: true, displayName: true, avatarUrl: true } },
            teachesSkill: { include: { category: true } },
          },
        },
      },
    });

    return updatedCycle;
  });
}

/**
 * Retrieves barter cycles for a given user (as participant or initiator).
 */
export async function getUserBarterCycles(
  userId: string,
  client: PrismaClient = db,
) {
  return client.barterCycle.findMany({
    where: {
      participants: {
        some: { userId },
      },
    },
    include: {
      participants: {
        include: {
          user: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
          teachesSkill: {
            include: { category: true },
          },
        },
        orderBy: { position: "asc" },
      },
      sessions: {
        include: {
          skill: true,
          learner: { select: { id: true, displayName: true, avatarUrl: true } },
          teacher: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      },
    },
    orderBy: { proposedAt: "desc" },
  });
}


