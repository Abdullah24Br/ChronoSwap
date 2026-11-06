import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { searchTeachersSchema, type SearchTeachersInput } from "./schemas";

export interface TeacherSearchResult {
  id: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  timezone: string;
  ratingCount: number;
  ratingSum: number;
  averageRating: number;
  offeredSkills: {
    id: string;
    slug: string;
    nameAr: string;
    nameEn: string | null;
    category: {
      id: string;
      slug: string;
      nameAr: string;
    };
  }[];
  availabilitySlots: {
    weekday: number;
    startMinute: number;
    endMinute: number;
    timezone: string;
  }[];
}

export interface SearchTeachersResult {
  teachers: TeacherSearchResult[];
  total: number;
}

/**
 * FR-3.1: Search teachers by skill, and filter results by rating and availability.
 */
export async function searchTeachers(
  rawInput: SearchTeachersInput,
  client: PrismaClient = db,
): Promise<SearchTeachersResult> {
  const input = searchTeachersSchema.parse(rawInput);

  const where: Prisma.UserWhereInput = {
    role: "USER",
    emailVerifiedAt: { not: null }, // Only active verified users
    ...(input.excludeUserId ? { id: { not: input.excludeUserId } } : {}),
  };

  // Must offer at least one skill matching the filter
  const skillCondition: Prisma.UserSkillWhereInput = {
    kind: "OFFERED",
    ...(input.skillId ? { skillId: input.skillId } : {}),
    ...(input.categoryId ? { skill: { categoryId: input.categoryId } } : {}),
  };
  where.skills = { some: skillCondition };

  // Availability filter by weekday
  if (input.weekday !== undefined) {
    where.availability = {
      some: {
        weekday: input.weekday,
      },
    };
  }

  // Free-text query matching teacher name, bio, or skill name
  if (input.query && input.query.trim().length > 0) {
    const q = input.query.trim();
    where.OR = [
      { displayName: { contains: q, mode: "insensitive" } },
      { bio: { contains: q, mode: "insensitive" } },
      {
        skills: {
          some: {
            kind: "OFFERED",
            skill: {
              OR: [
                { nameAr: { contains: q, mode: "insensitive" } },
                { nameEn: { contains: q, mode: "insensitive" } },
              ],
            },
          },
        },
      },
    ];
  }

  // Fetch candidate teachers with their offered skills and availability slots
  const users = await client.user.findMany({
    where,
    include: {
      skills: {
        where: { kind: "OFFERED" },
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

  // Calculate average rating and apply minRating filter
  let results: TeacherSearchResult[] = users.map((u) => {
    const averageRating =
      u.ratingCount > 0 ? Number((u.ratingSum / u.ratingCount).toFixed(1)) : 0;

    return {
      id: u.id,
      displayName: u.displayName,
      bio: u.bio,
      avatarUrl: u.avatarUrl,
      timezone: u.timezone,
      ratingCount: u.ratingCount,
      ratingSum: u.ratingSum,
      averageRating,
      offeredSkills: u.skills.map((us) => ({
        id: us.skill.id,
        slug: us.skill.slug,
        nameAr: us.skill.nameAr,
        nameEn: us.skill.nameEn,
        category: {
          id: us.skill.category.id,
          slug: us.skill.category.slug,
          nameAr: us.skill.category.nameAr,
        },
      })),
      availabilitySlots: u.availability.map((s) => ({
        weekday: s.weekday,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
        timezone: s.timezone,
      })),
    };
  });

  if (input.minRating !== undefined && input.minRating > 0) {
    results = results.filter((r) => r.averageRating >= input.minRating!);
  }

  // Sort: highest average rating first, then highest rating count, then alphabetical
  results.sort((a, b) => {
    if (b.averageRating !== a.averageRating) {
      return b.averageRating - a.averageRating;
    }
    if (b.ratingCount !== a.ratingCount) {
      return b.ratingCount - a.ratingCount;
    }
    return a.displayName.localeCompare(b.displayName, "ar");
  });

  const total = results.length;
  const paginated = results.slice(input.offset, input.offset + input.limit);

  return {
    teachers: paginated,
    total,
  };
}
