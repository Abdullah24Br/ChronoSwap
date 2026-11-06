import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { searchTeachers } from "@/server/services/search/search-service";

afterAll(() => db.$disconnect());

async function makeTestUser(opts: {
  displayName?: string;
  bio?: string;
  ratingSum?: number;
  ratingCount?: number;
} = {}) {
  return db.user.create({
    data: {
      email: `search-user-${randomUUID()}@chronoswap.test`,
      passwordHash: "hash",
      displayName: opts.displayName ?? "مدرس تجريبي",
      bio: opts.bio ?? "نبذة تجريبية",
      emailVerifiedAt: new Date(),
      ratingSum: opts.ratingSum ?? 0,
      ratingCount: opts.ratingCount ?? 0,
      wallet: { create: {} },
    },
  });
}

async function makeSkillAndCategory() {
  const category = await db.skillCategory.create({
    data: {
      slug: `cat-${randomUUID()}`,
      nameAr: `برمجة-${randomUUID().slice(0, 6)}`,
    },
  });

  const skill1 = await db.skill.create({
    data: {
      categoryId: category.id,
      slug: `skill-python-${randomUUID()}`,
      nameAr: `بايثون المتقدمة-${randomUUID().slice(0, 6)}`,
      nameEn: "Python",
    },
  });

  const skill2 = await db.skill.create({
    data: {
      categoryId: category.id,
      slug: `skill-design-${randomUUID()}`,
      nameAr: `تصميم الواجهات-${randomUUID().slice(0, 6)}`,
      nameEn: "UI Design",
    },
  });

  return { category, skill1, skill2 };
}

describe("Teacher Search & Filtering (FR-3.1)", () => {
  it("searches teachers by specific skill ID", async () => {
    const { skill1, skill2 } = await makeSkillAndCategory();
    const teacherPython = await makeTestUser({ displayName: "أحمد بايثون" });
    const teacherDesign = await makeTestUser({ displayName: "سارة تصميم" });

    // Link skills
    await db.userSkill.create({
      data: { userId: teacherPython.id, skillId: skill1.id, kind: "OFFERED" },
    });
    await db.userSkill.create({
      data: { userId: teacherDesign.id, skillId: skill2.id, kind: "OFFERED" },
    });

    const res = await searchTeachers({ skillId: skill1.id }, db);
    const teacherIds = res.teachers.map((t) => t.id);

    expect(teacherIds).toContain(teacherPython.id);
    expect(teacherIds).not.toContain(teacherDesign.id);
  });

  it("filters teachers by category ID", async () => {
    const { category, skill1 } = await makeSkillAndCategory();
    const teacher = await makeTestUser({ displayName: "معلم في التصنيف" });

    await db.userSkill.create({
      data: { userId: teacher.id, skillId: skill1.id, kind: "OFFERED" },
    });

    const res = await searchTeachers({ categoryId: category.id }, db);
    expect(res.teachers.some((t) => t.id === teacher.id)).toBe(true);
  });

  it("searches by query matching teacher name or bio", async () => {
    const { skill1 } = await makeSkillAndCategory();
    const uniqueName = `خبير-${randomUUID().slice(0, 8)}`;
    const teacher = await makeTestUser({ displayName: uniqueName, bio: "مهندس برمجيات ذكاء اصطناعي" });

    await db.userSkill.create({
      data: { userId: teacher.id, skillId: skill1.id, kind: "OFFERED" },
    });

    const resByName = await searchTeachers({ query: uniqueName }, db);
    expect(resByName.teachers.some((t) => t.id === teacher.id)).toBe(true);

    const resByBio = await searchTeachers({ query: "ذكاء اصطناعي" }, db);
    expect(resByBio.teachers.some((t) => t.id === teacher.id)).toBe(true);
  });

  it("filters teachers by minimum rating (FR-3.1)", async () => {
    const { skill1 } = await makeSkillAndCategory();

    // Teacher with 5 stars rating (15 / 3 = 5.0)
    const topTeacher = await makeTestUser({
      displayName: "معلم ممتاز",
      ratingSum: 15,
      ratingCount: 3,
    });
    await db.userSkill.create({
      data: { userId: topTeacher.id, skillId: skill1.id, kind: "OFFERED" },
    });

    // Teacher with 3 stars rating (6 / 2 = 3.0)
    const avgTeacher = await makeTestUser({
      displayName: "معلم متوسط",
      ratingSum: 6,
      ratingCount: 2,
    });
    await db.userSkill.create({
      data: { userId: avgTeacher.id, skillId: skill1.id, kind: "OFFERED" },
    });

    const res = await searchTeachers({ skillId: skill1.id, minRating: 4.0 }, db);
    const ids = res.teachers.map((t) => t.id);

    expect(ids).toContain(topTeacher.id);
    expect(ids).not.toContain(avgTeacher.id);
  });

  it("filters teachers by availability weekday (FR-3.1)", async () => {
    const { skill1 } = await makeSkillAndCategory();

    const sundayTeacher = await makeTestUser({ displayName: "متاح الأحد" });
    await db.userSkill.create({
      data: { userId: sundayTeacher.id, skillId: skill1.id, kind: "OFFERED" },
    });
    await db.availabilitySlot.create({
      data: {
        userId: sundayTeacher.id,
        weekday: 0, // Sunday
        startMinute: 600,
        endMinute: 720,
        timezone: "Asia/Damascus",
      },
    });

    const mondayTeacher = await makeTestUser({ displayName: "متاح الإثنين" });
    await db.userSkill.create({
      data: { userId: mondayTeacher.id, skillId: skill1.id, kind: "OFFERED" },
    });
    await db.availabilitySlot.create({
      data: {
        userId: mondayTeacher.id,
        weekday: 1, // Monday
        startMinute: 600,
        endMinute: 720,
        timezone: "Asia/Damascus",
      },
    });

    const resSunday = await searchTeachers({ skillId: skill1.id, weekday: 0 }, db);
    const sundayIds = resSunday.teachers.map((t) => t.id);
    expect(sundayIds).toContain(sundayTeacher.id);
    expect(sundayIds).not.toContain(mondayTeacher.id);
  });

  it("excludes current user from search results", async () => {
    const { skill1 } = await makeSkillAndCategory();
    const currentUser = await makeTestUser({ displayName: "أنا المتعلم المعلم" });

    await db.userSkill.create({
      data: { userId: currentUser.id, skillId: skill1.id, kind: "OFFERED" },
    });

    const res = await searchTeachers(
      { skillId: skill1.id, excludeUserId: currentUser.id },
      db,
    );
    expect(res.teachers.some((t) => t.id === currentUser.id)).toBe(false);
  });
});
