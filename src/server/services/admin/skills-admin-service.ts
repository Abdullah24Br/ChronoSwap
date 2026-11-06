import type { PrismaClient } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { DomainError, ForbiddenError, NotFoundError } from "@/server/errors";

// ─────────────────────────────────────────────────────────────
// FR-7.1: Skills & Categories Administration
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

export interface CreateCategoryInput {
  nameAr: string;
  nameEn?: string;
  slug: string;
  position?: number;
}

export interface UpdateCategoryInput {
  nameAr?: string;
  nameEn?: string;
  slug?: string;
  position?: number;
  isActive?: boolean;
}

export interface CreateSkillInput {
  categoryId: string;
  nameAr: string;
  nameEn?: string;
  slug: string;
}

export interface UpdateSkillInput {
  categoryId?: string;
  nameAr?: string;
  nameEn?: string;
  slug?: string;
  isActive?: boolean;
}

/**
 * Returns all categories (active & inactive) with all skills for the admin panel.
 */
export async function getAdminTaxonomy(adminId: string, client: PrismaClient = db) {
  await assertAdmin(adminId, client);

  return client.skillCategory.findMany({
    orderBy: { position: "asc" },
    include: {
      skills: {
        orderBy: { nameAr: "asc" },
        include: {
          _count: {
            select: {
              sessions: true,
              userSkills: true,
            },
          },
        },
      },
      _count: {
        select: {
          skills: true,
        },
      },
    },
  });
}

/**
 * FR-7.1: Create a new skill category.
 */
export async function createCategory(
  adminId: string,
  input: CreateCategoryInput,
  client: PrismaClient = db,
) {
  await assertAdmin(adminId, client);

  const cleanSlug = input.slug.trim().toLowerCase().replace(/\s+/g, "-");
  const cleanNameAr = input.nameAr.trim();

  if (!cleanNameAr || !cleanSlug) {
    throw new DomainError("INVALID_INPUT", "الاسم العربي والرمز اللطيف (slug) مطلوبان");
  }

  // Check unique constraints
  const existing = await client.skillCategory.findFirst({
    where: {
      OR: [{ slug: cleanSlug }, { nameAr: cleanNameAr }],
    },
  });

  if (existing) {
    throw new DomainError("DUPLICATE_CATEGORY", "يوجد تصنيف آخر بنفس الاسم العربي أو الرمز اللطيف");
  }

  return client.skillCategory.create({
    data: {
      slug: cleanSlug,
      nameAr: cleanNameAr,
      nameEn: input.nameEn?.trim() || null,
      position: input.position ?? 0,
      isActive: true,
    },
  });
}

/**
 * FR-7.1: Update an existing skill category.
 */
export async function updateCategory(
  adminId: string,
  categoryId: string,
  input: UpdateCategoryInput,
  client: PrismaClient = db,
) {
  await assertAdmin(adminId, client);

  const category = await client.skillCategory.findUnique({
    where: { id: categoryId },
  });

  if (!category) {
    throw new NotFoundError("التصنيف غير موجود");
  }

  const data: Parameters<typeof client.skillCategory.update>[0]["data"] = {};

  if (input.nameAr !== undefined) {
    const cleanNameAr = input.nameAr.trim();
    if (!cleanNameAr) throw new DomainError("INVALID_INPUT", "الاسم العربي مطلوب");
    data.nameAr = cleanNameAr;
  }

  if (input.nameEn !== undefined) {
    data.nameEn = input.nameEn.trim() || null;
  }

  if (input.slug !== undefined) {
    const cleanSlug = input.slug.trim().toLowerCase().replace(/\s+/g, "-");
    if (!cleanSlug) throw new DomainError("INVALID_INPUT", "الرمز اللطيف مطلوب");
    data.slug = cleanSlug;
  }

  if (input.position !== undefined) {
    data.position = input.position;
  }

  if (input.isActive !== undefined) {
    data.isActive = input.isActive;
  }

  return client.skillCategory.update({
    where: { id: categoryId },
    data,
  });
}

/**
 * FR-7.1: Soft-delete (archive) a category and its skills.
 */
export async function archiveCategory(
  adminId: string,
  categoryId: string,
  client: PrismaClient = db,
) {
  await assertAdmin(adminId, client);

  return client.$transaction(async (tx) => {
    const category = await tx.skillCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundError("التصنيف غير موجود");
    }

    // Archive category and its skills
    await tx.skill.updateMany({
      where: { categoryId },
      data: { isActive: false },
    });

    return tx.skillCategory.update({
      where: { id: categoryId },
      data: { isActive: false },
    });
  });
}

/**
 * FR-7.1: Create a new skill within a category.
 */
export async function createSkill(
  adminId: string,
  input: CreateSkillInput,
  client: PrismaClient = db,
) {
  await assertAdmin(adminId, client);

  const category = await client.skillCategory.findUnique({
    where: { id: input.categoryId },
  });

  if (!category) {
    throw new NotFoundError("التصنيف المحدد غير موجود");
  }

  const cleanSlug = input.slug.trim().toLowerCase().replace(/\s+/g, "-");
  const cleanNameAr = input.nameAr.trim();

  if (!cleanNameAr || !cleanSlug) {
    throw new DomainError("INVALID_INPUT", "اسم المهارة بالعربية والرمز اللطيف مطلوبان");
  }

  // Check unique constraints: slug globally unique, nameAr unique per category
  const existingSlug = await client.skill.findUnique({
    where: { slug: cleanSlug },
  });

  if (existingSlug) {
    throw new DomainError("DUPLICATE_SKILL", "الرمز اللطيف للمهارة مستخدم مسبقاً");
  }

  const existingInCat = await client.skill.findUnique({
    where: {
      categoryId_nameAr: {
        categoryId: input.categoryId,
        nameAr: cleanNameAr,
      },
    },
  });

  if (existingInCat) {
    throw new DomainError("DUPLICATE_SKILL", "توجد مهارة أخرى بنفس الاسم العربي داخل هذا التصنيف");
  }

  return client.skill.create({
    data: {
      categoryId: input.categoryId,
      slug: cleanSlug,
      nameAr: cleanNameAr,
      nameEn: input.nameEn?.trim() || null,
      isActive: true,
    },
  });
}

/**
 * FR-7.1: Update an existing skill.
 */
export async function updateSkill(
  adminId: string,
  skillId: string,
  input: UpdateSkillInput,
  client: PrismaClient = db,
) {
  await assertAdmin(adminId, client);

  const skill = await client.skill.findUnique({
    where: { id: skillId },
  });

  if (!skill) {
    throw new NotFoundError("المهارة غير موجودة");
  }

  const data: Parameters<typeof client.skill.update>[0]["data"] = {};

  if (input.categoryId !== undefined) {
    const category = await client.skillCategory.findUnique({
      where: { id: input.categoryId },
    });
    if (!category) throw new NotFoundError("التصنيف الجديد غير موجود");
    data.categoryId = input.categoryId;
  }

  if (input.nameAr !== undefined) {
    const cleanNameAr = input.nameAr.trim();
    if (!cleanNameAr) throw new DomainError("INVALID_INPUT", "اسم المهارة مطلوب");
    data.nameAr = cleanNameAr;
  }

  if (input.nameEn !== undefined) {
    data.nameEn = input.nameEn.trim() || null;
  }

  if (input.slug !== undefined) {
    const cleanSlug = input.slug.trim().toLowerCase().replace(/\s+/g, "-");
    if (!cleanSlug) throw new DomainError("INVALID_INPUT", "الرمز اللطيف مطلوب");
    data.slug = cleanSlug;
  }

  if (input.isActive !== undefined) {
    data.isActive = input.isActive;
  }

  return client.skill.update({
    where: { id: skillId },
    data,
  });
}

/**
 * FR-7.1: Soft-delete (archive) an individual skill.
 */
export async function archiveSkill(
  adminId: string,
  skillId: string,
  client: PrismaClient = db,
) {
  await assertAdmin(adminId, client);

  const skill = await client.skill.findUnique({
    where: { id: skillId },
  });

  if (!skill) {
    throw new NotFoundError("المهارة غير موجودة");
  }

  return client.skill.update({
    where: { id: skillId },
    data: { isActive: false },
  });
}

