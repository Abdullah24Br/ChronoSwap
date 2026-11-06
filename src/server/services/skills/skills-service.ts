import { db } from "@/server/db";
import { DomainError, NotFoundError } from "@/server/errors";

// FR-1.3: Skills Matrix Service.
// Manages Skills Offered and Skills Wanted from the approved taxonomy.
// Enforces that offered and wanted lists are strictly disjoint.

export interface UserSkillsDto {
  offeredSkillIds: string[];
  wantedSkillIds: string[];
}

export type TaxonomyCategory = Awaited<ReturnType<typeof getSkillsTaxonomy>>[number];

/**
 * Returns all active categories with their active skills.
 */
export async function getSkillsTaxonomy() {
  return db.skillCategory.findMany({
    where: { isActive: true },
    orderBy: { position: "asc" },
    include: {
      skills: {
        where: { isActive: true },
        orderBy: { nameAr: "asc" },
      },
    },
  });
}

/**
 * Returns the current user's skills separated into offered and wanted lists.
 */
export async function getUserSkills(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) {
    throw new NotFoundError("المستخدم غير موجود");
  }

  const records = await db.userSkill.findMany({
    where: { userId },
    include: {
      skill: {
        include: {
          category: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const offered = records.filter((r) => r.kind === "OFFERED").map((r) => r.skill);
  const wanted = records.filter((r) => r.kind === "WANTED").map((r) => r.skill);

  return {
    offered,
    wanted,
    offeredIds: offered.map((s) => s.id),
    wantedIds: wanted.map((s) => s.id),
  };
}

/**
 * FR-1.3: Updates the user's offered and wanted skills.
 * Guarantees that no skill is present in both lists.
 */
export async function setUserSkills(userId: string, input: UserSkillsDto) {
  const offeredSet = new Set(input.offeredSkillIds);

  // Check disjointness (no skill can be both offered and wanted)
  for (const wantedId of input.wantedSkillIds) {
    if (offeredSet.has(wantedId)) {
      throw new DomainError(
        "SKILLS_OVERLAP",
        "لا يمكن للمهارة أن تكون معروضة ومطلوبة في الوقت نفسه (FR-1.3)",
      );
    }
  }

  const allSkillIds = Array.from(new Set([...input.offeredSkillIds, ...input.wantedSkillIds]));

  // Verify all skills exist and are active in the taxonomy
  if (allSkillIds.length > 0) {
    const validSkills = await db.skill.findMany({
      where: {
        id: { in: allSkillIds },
        isActive: true,
      },
      select: { id: true },
    });

    if (validSkills.length !== allSkillIds.length) {
      throw new DomainError("INVALID_SKILL", "إحدى المهارات المحددة غير موجودة أو معطّلة");
    }
  }

  // Atomically replace the user's skill lists
  await db.$transaction(async (tx) => {
    await tx.userSkill.deleteMany({
      where: { userId },
    });

    const entries = [
      ...input.offeredSkillIds.map((skillId) => ({
        userId,
        skillId,
        kind: "OFFERED" as const,
      })),
      ...input.wantedSkillIds.map((skillId) => ({
        userId,
        skillId,
        kind: "WANTED" as const,
      })),
    ];

    if (entries.length > 0) {
      await tx.userSkill.createMany({
        data: entries,
      });
    }
  });

  return getUserSkills(userId);
}
