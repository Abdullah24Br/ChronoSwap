import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getUserSkills, setUserSkills } from "@/server/services/skills/skills-service";

afterAll(() => db.$disconnect());

async function makeTestCategoryAndSkills() {
  const category = await db.skillCategory.create({
    data: {
      slug: `cat-${randomUUID()}`,
      nameAr: `تصنيف-${randomUUID().slice(0, 8)}`,
      nameEn: `Category-${randomUUID().slice(0, 8)}`,
    },
  });

  const s1 = await db.skill.create({
    data: {
      categoryId: category.id,
      slug: `skill-1-${randomUUID()}`,
      nameAr: `مهارة أولى-${randomUUID().slice(0, 6)}`,
      nameEn: "Skill 1",
    },
  });

  const s2 = await db.skill.create({
    data: {
      categoryId: category.id,
      slug: `skill-2-${randomUUID()}`,
      nameAr: `مهارة ثانية-${randomUUID().slice(0, 6)}`,
      nameEn: "Skill 2",
    },
  });

  const s3 = await db.skill.create({
    data: {
      categoryId: category.id,
      slug: `skill-3-${randomUUID()}`,
      nameAr: `مهارة ثالثة-${randomUUID().slice(0, 6)}`,
      nameEn: "Skill 3",
    },
  });

  return [s1, s2, s3];
}

async function makeTestUser() {
  return db.user.create({
    data: {
      email: `skill-user-${randomUUID()}@chronoswap.test`,
      passwordHash: "hash",
      displayName: "مستخدم المهارات",
      emailVerifiedAt: new Date(),
      wallet: { create: {} },
    },
  });
}

describe("Skills Matrix Integration (FR-1.3)", () => {
  it("saves and retrieves user's offered and wanted skills", async () => {
    const user = await makeTestUser();
    const [skill1, skill2, skill3] = await makeTestCategoryAndSkills();

    // Set skills: skill1 offered, skill2 and skill3 wanted
    await setUserSkills(user.id, {
      offeredSkillIds: [skill1.id],
      wantedSkillIds: [skill2.id, skill3.id],
    });

    const userSkills = await getUserSkills(user.id);
    expect(userSkills.offeredIds).toEqual([skill1.id]);
    expect(userSkills.wantedIds).toContain(skill2.id);
    expect(userSkills.wantedIds).toContain(skill3.id);
  });

  it("rejects saving overlapping skills in offered and wanted lists", async () => {
    const user = await makeTestUser();
    const [skill] = await makeTestCategoryAndSkills();

    await expect(
      setUserSkills(user.id, {
        offeredSkillIds: [skill.id],
        wantedSkillIds: [skill.id],
      }),
    ).rejects.toThrow(/لا يمكن للمهارة أن تكون معروضة ومطلوبة/);
  });

  it("updates skills cleanly on subsequent changes", async () => {
    const user = await makeTestUser();
    const [s1, s2] = await makeTestCategoryAndSkills();

    // First save: s1 offered
    await setUserSkills(user.id, {
      offeredSkillIds: [s1.id],
      wantedSkillIds: [],
    });

    let res = await getUserSkills(user.id);
    expect(res.offeredIds).toEqual([s1.id]);
    expect(res.wantedIds).toHaveLength(0);

    // Swap: s1 wanted, s2 offered
    await setUserSkills(user.id, {
      offeredSkillIds: [s2.id],
      wantedSkillIds: [s1.id],
    });

    res = await getUserSkills(user.id);
    expect(res.offeredIds).toEqual([s2.id]);
    expect(res.wantedIds).toEqual([s1.id]);
  });
});
