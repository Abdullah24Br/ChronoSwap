import type { PrismaClient, SessionStatus } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";

// ─────────────────────────────────────────────────────────────
// FR-7.3: Platform Statistics Dashboard
// ─────────────────────────────────────────────────────────────

async function assertAdmin(userId: string, client: PrismaClient = db) {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user || user.role !== "ADMIN") {
    throw new ForbiddenError("غير مصرح: هذه العملية مخصصة لمدير النظام فقط");
  }
}

export interface PlatformStats {
  totalUsers: number;
  totalSessions: number;
  activeSessionsCount: number;
  completedSessionsCount: number;
  totalExchangedMinutes: number;
  totalExchangedHours: number;
  openDisputesCount: number;
  resolvedDisputesCount: number;
  barterCyclesCount: number;
  topWantedSkills: Array<{
    skillId: string;
    nameAr: string;
    nameEn: string | null;
    categoryNameAr: string;
    wantedCount: number;
  }>;
  recentSessions: Array<{
    id: string;
    status: string;
    kind: string;
    durationMinutes: number;
    startAt: Date;
    learnerName: string;
    teacherName: string;
    skillName: string;
  }>;
}

export async function getPlatformStats(
  adminId: string,
  client: PrismaClient = db,
): Promise<PlatformStats> {
  await assertAdmin(adminId, client);

  // 1. Total users
  const totalUsers = await client.user.count();

  // 2. Total sessions & by status
  const totalSessions = await client.session.count();

  const activeSessionsCount = await client.session.count({
    where: {
      status: { in: ["ACCEPTED", "IN_PROGRESS"] },
    },
  });

  const completedStatuses: SessionStatus[] = [
    "ENDED",
    "QUIZ_PENDING",
    "RELEASED",
    "RESOLVED_RELEASED",
    "BARTER_COMPLETED",
    "BARTER_SETTLED",
  ];

  const completedSessions = await client.session.findMany({
    where: {
      status: { in: completedStatuses },
    },
    select: {
      durationMinutes: true,
    },
  });

  const completedSessionsCount = completedSessions.length;
  const totalExchangedMinutes = completedSessions.reduce(
    (acc, curr) => acc + curr.durationMinutes,
    0,
  );
  const totalExchangedHours = Math.round((totalExchangedMinutes / 60) * 10) / 10;

  // 3. Disputes counts
  const openDisputesCount = await client.dispute.count({
    where: { status: "OPEN" },
  });

  const resolvedDisputesCount = await client.dispute.count({
    where: { status: "RESOLVED" },
  });

  // 4. Barter cycles
  const barterCyclesCount = await client.barterCycle.count();

  // 5. Most-requested skills (Top wanted)
  const wantedSkillsGroup = await client.userSkill.groupBy({
    by: ["skillId"],
    where: { kind: "WANTED" },
    _count: {
      skillId: true,
    },
    orderBy: {
      _count: {
        skillId: "desc",
      },
    },
    take: 5,
  });

  const topWantedSkillsDetails = await Promise.all(
    wantedSkillsGroup.map(async (group) => {
      const skill = await client.skill.findUnique({
        where: { id: group.skillId },
        include: { category: true },
      });
      return {
        skillId: group.skillId,
        nameAr: skill?.nameAr || "مهارة غير معروفة",
        nameEn: skill?.nameEn || null,
        categoryNameAr: skill?.category.nameAr || "عام",
        wantedCount: group._count.skillId,
      };
    }),
  );

  // 6. Recent sessions
  const recent = await client.session.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      learner: { select: { displayName: true } },
      teacher: { select: { displayName: true } },
      skill: { select: { nameAr: true } },
    },
  });

  const recentSessions = recent.map((s) => ({
    id: s.id,
    status: s.status,
    kind: s.kind,
    durationMinutes: s.durationMinutes,
    startAt: s.startAt,
    learnerName: s.learner.displayName,
    teacherName: s.teacher.displayName,
    skillName: s.skill.nameAr,
  }));

  return {
    totalUsers,
    totalSessions,
    activeSessionsCount,
    completedSessionsCount,
    totalExchangedMinutes,
    totalExchangedHours,
    openDisputesCount,
    resolvedDisputesCount,
    barterCyclesCount,
    topWantedSkills: topWantedSkillsDetails,
    recentSessions,
  };
}
