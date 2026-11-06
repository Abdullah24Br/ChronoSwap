"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import { getCurrentUser } from "@/server/auth/session";
import { ForbiddenError } from "@/server/errors";
import { resolveDispute } from "@/server/services/admin/disputes-admin-service";
import {
  archiveCategory,
  archiveSkill,
  createCategory,
  createSkill,
  updateCategory,
  updateSkill,
} from "@/server/services/admin/skills-admin-service";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    throw new ForbiddenError("غير مصرح: يجب تسجيل الدخول كمدير نظام للوصول إلى هذه العمليات");
  }
  return user;
}

// ─────────────────────────────────────────────────────────────
// FR-7.1: Category Actions
// ─────────────────────────────────────────────────────────────

export const createCategoryAction = defineAction(
  z.object({
    nameAr: z.string().min(2, "الاسم بالعربية مطلوب (حرفان على الأقل)").max(80),
    nameEn: z.string().max(80).optional(),
    slug: z.string().min(2).max(64),
    position: z.number().int().nonnegative().optional(),
  }),
  async (input) => {
    const admin = await requireAdmin();
    return createCategory(admin.id, input);
  },
);

export const updateCategoryAction = defineAction(
  z.object({
    categoryId: z.string().uuid("معرف التصنيف غير صالح"),
    nameAr: z.string().min(2).max(80).optional(),
    nameEn: z.string().max(80).optional(),
    slug: z.string().min(2).max(64).optional(),
    position: z.number().int().nonnegative().optional(),
    isActive: z.boolean().optional(),
  }),
  async ({ categoryId, ...input }) => {
    const admin = await requireAdmin();
    return updateCategory(admin.id, categoryId, input);
  },
);

export const archiveCategoryAction = defineAction(
  z.object({
    categoryId: z.string().uuid("معرف التصنيف غير صالح"),
  }),
  async ({ categoryId }) => {
    const admin = await requireAdmin();
    return archiveCategory(admin.id, categoryId);
  },
);

// ─────────────────────────────────────────────────────────────
// FR-7.1: Skill Actions
// ─────────────────────────────────────────────────────────────

export const createSkillAction = defineAction(
  z.object({
    categoryId: z.string().uuid("معرف التصنيف غير صالح"),
    nameAr: z.string().min(2, "اسم المهارة بالعربية مطلوب").max(80),
    nameEn: z.string().max(80).optional(),
    slug: z.string().min(2).max(64),
  }),
  async (input) => {
    const admin = await requireAdmin();
    return createSkill(admin.id, input);
  },
);

export const updateSkillAction = defineAction(
  z.object({
    skillId: z.string().uuid("معرف المهارة غير صالح"),
    categoryId: z.string().uuid().optional(),
    nameAr: z.string().min(2).max(80).optional(),
    nameEn: z.string().max(80).optional(),
    slug: z.string().min(2).max(64).optional(),
    isActive: z.boolean().optional(),
  }),
  async ({ skillId, ...input }) => {
    const admin = await requireAdmin();
    return updateSkill(admin.id, skillId, input);
  },
);

export const archiveSkillAction = defineAction(
  z.object({
    skillId: z.string().uuid("معرف المهارة غير صالح"),
  }),
  async ({ skillId }) => {
    const admin = await requireAdmin();
    return archiveSkill(admin.id, skillId);
  },
);

// ─────────────────────────────────────────────────────────────
// FR-7.2: Dispute Resolution Action
// ─────────────────────────────────────────────────────────────

export const resolveDisputeAction = defineAction(
  z.object({
    disputeId: z.string().uuid("معرف النزاع غير صالح"),
    resolution: z.enum(["REFUND_LEARNER", "PAY_TEACHER"]),
    adminNote: z.string().max(2000).optional(),
  }),
  async (input) => {
    const admin = await requireAdmin();
    return resolveDispute(admin.id, input);
  },
);

