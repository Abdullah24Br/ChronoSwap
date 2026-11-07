import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { DomainError, ForbiddenError } from "@/server/errors";
import {
  getDisputeEvidence,
  resolveDispute,
} from "@/server/services/admin/disputes-admin-service";
import {
  archiveCategory,
  archiveSkill,
  createCategory,
  createSkill,
  getAdminTaxonomy,
  updateCategory,
  updateSkill,
} from "@/server/services/admin/skills-admin-service";
import { getPlatformStats } from "@/server/services/admin/stats-service";
import { acceptSessionRequest, requestSession } from "@/server/services/sessions/booking-service";
import { recordSessionAttendance } from "@/server/services/sessions/cancellation-service";
import { reportProblem } from "@/server/services/sessions/dispute-service";

describe("Admin Panel & Platform Governance (Module 7: FR-7.1, FR-7.2, FR-7.3)", () => {
  async function createAdminTestFixture() {
    const unique = Math.random().toString(36).substring(2, 9);

    const admin = await db.user.create({
      data: {
        email: `admin-${unique}@chronoswap.test`,
        passwordHash: "hash123",
        displayName: `مدير النظام-${unique}`,
        role: "ADMIN",
        timezone: "Asia/Damascus",
        wallet: {
          create: {
            availableMinutes: 0,
            frozenMinutes: 0,
            debtMinutes: 0,
          },
        },
      },
      include: { wallet: true },
    });

    const nonAdmin = await db.user.create({
      data: {
        email: `user-${unique}@chronoswap.test`,
        passwordHash: "hash123",
        displayName: `مستخدم عادي-${unique}`,
        role: "USER",
        timezone: "Asia/Damascus",
        wallet: {
          create: {
            availableMinutes: 300,
            frozenMinutes: 0,
            debtMinutes: 0,
          },
        },
      },
      include: { wallet: true },
    });

    const teacher = await db.user.create({
      data: {
        email: `teacher-${unique}@chronoswap.test`,
        passwordHash: "hash123",
        displayName: `مدرّس-${unique}`,
        role: "USER",
        timezone: "Asia/Damascus",
        wallet: {
          create: {
            availableMinutes: 0,
            frozenMinutes: 0,
            debtMinutes: 0,
          },
        },
      },
      include: { wallet: true },
    });

    const category = await db.skillCategory.create({
      data: {
        slug: `cat-admin-${unique}`,
        nameAr: `تصنيف إداري-${unique}`,
        nameEn: `Category Admin-${unique}`,
      },
    });

    const skill = await db.skill.create({
      data: {
        categoryId: category.id,
        slug: `skill-admin-${unique}`,
        nameAr: `مهارة إدارية-${unique}`,
        nameEn: `Skill Admin-${unique}`,
      },
    });

    await db.userSkill.create({
      data: {
        userId: teacher.id,
        skillId: skill.id,
        kind: "OFFERED",
      },
    });

    await db.availabilitySlot.createMany({
      data: [
        { userId: teacher.id, weekday: 0, startMinute: 0, endMinute: 1440, timezone: "UTC" },
        { userId: teacher.id, weekday: 1, startMinute: 0, endMinute: 1440, timezone: "UTC" },
        { userId: teacher.id, weekday: 2, startMinute: 0, endMinute: 1440, timezone: "UTC" },
        { userId: teacher.id, weekday: 3, startMinute: 0, endMinute: 1440, timezone: "UTC" },
        { userId: teacher.id, weekday: 4, startMinute: 0, endMinute: 1440, timezone: "UTC" },
        { userId: teacher.id, weekday: 5, startMinute: 0, endMinute: 1440, timezone: "UTC" },
        { userId: teacher.id, weekday: 6, startMinute: 0, endMinute: 1440, timezone: "UTC" },
      ],
    });

    return { admin, nonAdmin, teacher, category, skill };
  }

  // ─────────────────────────────────────────────────────────────
  // FR-7.1: Category & Skill Management
  // ─────────────────────────────────────────────────────────────

  it("FR-7.1: restricts skills taxonomy administration to ADMIN role", async () => {
    const { nonAdmin } = await createAdminTestFixture();

    await expect(
      getAdminTaxonomy(nonAdmin.id),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      createCategory(nonAdmin.id, {
        nameAr: "تصنيف تجريبي",
        slug: "test-cat",
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("FR-7.1: creates, updates, and archives categories", async () => {
    const { admin } = await createAdminTestFixture();
    const unique = Math.random().toString(36).substring(2, 7);

    // 1. Create
    const cat = await createCategory(admin.id, {
      nameAr: `تصنيف جديد-${unique}`,
      nameEn: `New Category-${unique}`,
      slug: `cat-crud-${unique}`,
      position: 10,
    });
    expect(cat.nameAr).toBe(`تصنيف جديد-${unique}`);
    expect(cat.isActive).toBe(true);

    // 2. Reject duplicate name or slug
    await expect(
      createCategory(admin.id, {
        nameAr: `تصنيف جديد-${unique}`,
        slug: `other-slug-${unique}`,
      }),
    ).rejects.toThrow(DomainError);

    // 3. Update
    const updated = await updateCategory(admin.id, cat.id, {
      nameAr: `تصنيف معدل-${unique}`,
      position: 20,
    });
    expect(updated.nameAr).toBe(`تصنيف معدل-${unique}`);
    expect(updated.position).toBe(20);

    // 4. Archive (soft-delete)
    const archived = await archiveCategory(admin.id, cat.id);
    expect(archived.isActive).toBe(false);

    const recheck = await db.skillCategory.findUniqueOrThrow({ where: { id: cat.id } });
    expect(recheck.isActive).toBe(false);
  });

  it("FR-7.1: creates, updates, and archives individual skills", async () => {
    const { admin, category } = await createAdminTestFixture();
    const unique = Math.random().toString(36).substring(2, 7);

    // 1. Create skill
    const skill = await createSkill(admin.id, {
      categoryId: category.id,
      nameAr: `مهارة فرعية-${unique}`,
      nameEn: `Sub Skill-${unique}`,
      slug: `sub-skill-${unique}`,
    });
    expect(skill.nameAr).toBe(`مهارة فرعية-${unique}`);
    expect(skill.isActive).toBe(true);

    // 2. Reject duplicate slug
    await expect(
      createSkill(admin.id, {
        categoryId: category.id,
        nameAr: `اسم مختلف-${unique}`,
        slug: `sub-skill-${unique}`,
      }),
    ).rejects.toThrow(DomainError);

    // 3. Update skill
    const updated = await updateSkill(admin.id, skill.id, {
      nameAr: `مهارة فرعية محدثة-${unique}`,
    });
    expect(updated.nameAr).toBe(`مهارة فرعية محدثة-${unique}`);

    // 4. Archive skill
    const archived = await archiveSkill(admin.id, skill.id);
    expect(archived.isActive).toBe(false);

    const recheck = await db.skill.findUniqueOrThrow({ where: { id: skill.id } });
    expect(recheck.isActive).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────
  // FR-7.2: Dispute Resolution (Arbitration)
  // ─────────────────────────────────────────────────────────────

  async function createDisputedSession(fixture: Awaited<ReturnType<typeof createAdminTestFixture>>) {
    const startAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const session = await requestSession(fixture.nonAdmin.id, {
      teacherId: fixture.teacher.id,
      skillId: fixture.skill.id,
      durationMinutes: 60,
      startAt,
      goal: "جلسة للتحكيم الإداري",
    });

    await acceptSessionRequest(fixture.teacher.id, { sessionId: session.id });
    await recordSessionAttendance(fixture.teacher.id, session.id, "JOIN", db, startAt);
    await recordSessionAttendance(fixture.nonAdmin.id, session.id, "JOIN", db, startAt);

    // End session
    await db.session.update({
      where: { id: session.id },
      data: {
        status: "ENDED",
        endedAt: new Date(),
        releaseDueAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
    });

    // Report problem
    const dispute = await reportProblem({
      sessionId: session.id,
      userId: fixture.nonAdmin.id,
      reason: "المدرّس لم يحضر في الموعد وقدم شرحاً غير كافٍ",
    });

    return { session, dispute };
  }

  it("FR-7.2: admin reviews dispute details and comprehensive evidence", async () => {
    const fixture = await createAdminTestFixture();
    const { dispute } = await createDisputedSession(fixture);

    const evidence = await getDisputeEvidence(fixture.admin.id, dispute.id);

    expect(evidence.id).toBe(dispute.id);
    expect(evidence.source).toBe("USER_REPORT");
    expect(evidence.session.learner.id).toBe(fixture.nonAdmin.id);
    expect(evidence.session.teacher.id).toBe(fixture.teacher.id);
    expect(evidence.session.attendance.length).toBeGreaterThanOrEqual(2);
    expect(evidence.session.events.length).toBeGreaterThan(0);
  });

  it("FR-7.2: resolves dispute by refunding learner (REFUND_LEARNER) and unfreezing wallet atomically", async () => {
    const fixture = await createAdminTestFixture();
    const { session, dispute } = await createDisputedSession(fixture);

    // Verify initial wallet state: learner had 300 - 60 = 240 available, 60 frozen
    const initialLearnerWallet = await db.wallet.findUniqueOrThrow({
      where: { userId: fixture.nonAdmin.id },
    });
    expect(initialLearnerWallet.availableMinutes).toBe(240);
    expect(initialLearnerWallet.frozenMinutes).toBe(60);

    const resolved = await resolveDispute(fixture.admin.id, {
      disputeId: dispute.id,
      resolution: "REFUND_LEARNER",
      adminNote: "تم التحقق من تقصير المدرّس وقررنا إعادة الساعات للمتعلم",
    });

    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.resolution).toBe("REFUND_LEARNER");
    expect(resolved.resolvedById).toBe(fixture.admin.id);

    // Session transitioned to RESOLVED_REFUNDED
    const updatedSession = await db.session.findUniqueOrThrow({
      where: { id: session.id },
      include: { events: true },
    });
    expect(updatedSession.status).toBe("RESOLVED_REFUNDED");

    // Event audit trail logged
    const event = updatedSession.events.find((e) => e.trigger === "FR-7.2:refund-learner");
    expect(event).toBeDefined();

    // Learner wallet refunded: 240 + 60 = 300 available, 0 frozen
    const refundedLearnerWallet = await db.wallet.findUniqueOrThrow({
      where: { userId: fixture.nonAdmin.id },
    });
    expect(refundedLearnerWallet.availableMinutes).toBe(300);
    expect(refundedLearnerWallet.frozenMinutes).toBe(0);

    // Teacher received nothing
    const teacherWallet = await db.wallet.findUniqueOrThrow({
      where: { userId: fixture.teacher.id },
    });
    expect(teacherWallet.availableMinutes).toBe(0);
  });

  it("FR-7.2: resolves dispute by paying teacher (PAY_TEACHER) and releasing hours atomically", async () => {
    const fixture = await createAdminTestFixture();
    const { session, dispute } = await createDisputedSession(fixture);

    const resolved = await resolveDispute(fixture.admin.id, {
      disputeId: dispute.id,
      resolution: "PAY_TEACHER",
      adminNote: "شرح المدرّس كان مستوفياً للأجندة والاعتراض غير مبرر",
    });

    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.resolution).toBe("PAY_TEACHER");

    // Session transitioned to RESOLVED_RELEASED
    const updatedSession = await db.session.findUniqueOrThrow({
      where: { id: session.id },
      include: { events: true },
    });
    expect(updatedSession.status).toBe("RESOLVED_RELEASED");

    const event = updatedSession.events.find((e) => e.trigger === "FR-7.2:pay-teacher");
    expect(event).toBeDefined();

    // Teacher received 60 minutes
    const teacherWallet = await db.wallet.findUniqueOrThrow({
      where: { userId: fixture.teacher.id },
    });
    expect(teacherWallet.availableMinutes).toBe(60);

    // Learner frozen balance released: 0 frozen, 240 available
    const learnerWallet = await db.wallet.findUniqueOrThrow({
      where: { userId: fixture.nonAdmin.id },
    });
    expect(learnerWallet.availableMinutes).toBe(240);
    expect(learnerWallet.frozenMinutes).toBe(0);
  });

  it("FR-7.2: prevents resolving an already resolved dispute", async () => {
    const fixture = await createAdminTestFixture();
    const { dispute } = await createDisputedSession(fixture);

    await resolveDispute(fixture.admin.id, {
      disputeId: dispute.id,
      resolution: "REFUND_LEARNER",
    });

    // Second resolution must fail
    await expect(
      resolveDispute(fixture.admin.id, {
        disputeId: dispute.id,
        resolution: "PAY_TEACHER",
      }),
    ).rejects.toThrow(DomainError);
  });

  // ─────────────────────────────────────────────────────────────
  // FR-7.3: Platform Statistics Dashboard
  // ─────────────────────────────────────────────────────────────

  it("FR-7.3: aggregates platform metrics correctly", async () => {
    const fixture = await createAdminTestFixture();

    // Add a wanted skill to test topWantedSkills
    await db.userSkill.create({
      data: {
        userId: fixture.nonAdmin.id,
        skillId: fixture.skill.id,
        kind: "WANTED",
      },
    });

    const stats = await getPlatformStats(fixture.admin.id);

    expect(stats.totalUsers).toBeGreaterThanOrEqual(3);
    expect(stats.totalSessions).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(stats.topWantedSkills)).toBe(true);
    expect(Array.isArray(stats.recentSessions)).toBe(true);
    expect(typeof stats.totalExchangedHours).toBe("number");
  });
});
