import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { findDirectMatches } from "@/server/services/barter/barter-service";

afterAll(() => db.$disconnect());

async function makeTestUser(displayName = "مستخدم مقايضة") {
  return db.user.create({
    data: {
      email: `barter-${randomUUID()}@chronoswap.test`,
      passwordHash: "hash",
      displayName,
      emailVerifiedAt: new Date(),
      wallet: { create: {} },
    },
  });
}

async function makeTestSkills() {
  const category = await db.skillCategory.create({
    data: {
      slug: `cat-${randomUUID()}`,
      nameAr: `تقنية-${randomUUID().slice(0, 6)}`,
    },
  });

  const python = await db.skill.create({
    data: {
      categoryId: category.id,
      slug: `python-${randomUUID()}`,
      nameAr: "بايثون",
    },
  });

  const react = await db.skill.create({
    data: {
      categoryId: category.id,
      slug: `react-${randomUUID()}`,
      nameAr: "رياكت",
    },
  });

  const guitar = await db.skill.create({
    data: {
      categoryId: category.id,
      slug: `guitar-${randomUUID()}`,
      nameAr: "عزف جيتار",
    },
  });

  return { python, react, guitar };
}

describe("Direct Barter Matching Engine (FR-3.2)", () => {
  it("finds mutual 1-to-1 direct matches (A offers S1, wants S2; B offers S2, wants S1)", async () => {
    const { python, react } = await makeTestSkills();
    const userA = await makeTestUser("المستخدم أ");
    const userB = await makeTestUser("المستخدم ب");

    // User A: offers Python, wants React
    await db.userSkill.createMany({
      data: [
        { userId: userA.id, skillId: python.id, kind: "OFFERED" },
        { userId: userA.id, skillId: react.id, kind: "WANTED" },
      ],
    });

    // User B: offers React, wants Python
    await db.userSkill.createMany({
      data: [
        { userId: userB.id, skillId: react.id, kind: "OFFERED" },
        { userId: userB.id, skillId: python.id, kind: "WANTED" },
      ],
    });

    const resA = await findDirectMatches(userA.id, db);
    expect(resA.matches).toHaveLength(1);
    expect(resA.matches[0].partner.id).toBe(userB.id);
    expect(resA.matches[0].theyTeachYou.map((s) => s.id)).toContain(react.id);
    expect(resA.matches[0].youTeachThem.map((s) => s.id)).toContain(python.id);

    // Mutual symmetry: User B also finds User A as a direct match
    const resB = await findDirectMatches(userB.id, db);
    expect(resB.matches).toHaveLength(1);
    expect(resB.matches[0].partner.id).toBe(userA.id);
    expect(resB.matches[0].theyTeachYou.map((s) => s.id)).toContain(python.id);
    expect(resB.matches[0].youTeachThem.map((s) => s.id)).toContain(react.id);
  });

  it("does not match when exchange is only one-way", async () => {
    const { python, react, guitar } = await makeTestSkills();
    const userA = await makeTestUser("المستخدم أ");
    const userC = await makeTestUser("المستخدم ج");

    // User A: offers Python, wants React
    await db.userSkill.createMany({
      data: [
        { userId: userA.id, skillId: python.id, kind: "OFFERED" },
        { userId: userA.id, skillId: react.id, kind: "WANTED" },
      ],
    });

    // User C: offers React, but wants Guitar (not offered by A)
    await db.userSkill.createMany({
      data: [
        { userId: userC.id, skillId: react.id, kind: "OFFERED" },
        { userId: userC.id, skillId: guitar.id, kind: "WANTED" },
      ],
    });

    const resA = await findDirectMatches(userA.id, db);
    expect(resA.matches.some((m) => m.partner.id === userC.id)).toBe(false);
  });

  it("returns empty matches if user has no offered skills or no wanted skills", async () => {
    const { python } = await makeTestSkills();
    const userOnlyOffers = await makeTestUser("معلم فقط");
    await db.userSkill.create({
      data: { userId: userOnlyOffers.id, skillId: python.id, kind: "OFFERED" },
    });

    const res = await findDirectMatches(userOnlyOffers.id, db);
    expect(res.matches).toHaveLength(0);
    expect(res.userOfferedCount).toBe(1);
    expect(res.userWantedCount).toBe(0);
  });

  it("handles multi-skill intersections between matching partners", async () => {
    const { python, react, guitar } = await makeTestSkills();
    const userA = await makeTestUser("متعدد أ");
    const userB = await makeTestUser("متعدد ب");

    // User A offers [Python, Guitar], wants [React]
    await db.userSkill.createMany({
      data: [
        { userId: userA.id, skillId: python.id, kind: "OFFERED" },
        { userId: userA.id, skillId: guitar.id, kind: "OFFERED" },
        { userId: userA.id, skillId: react.id, kind: "WANTED" },
      ],
    });

    // User B offers [React], wants [Python, Guitar]
    await db.userSkill.createMany({
      data: [
        { userId: userB.id, skillId: react.id, kind: "OFFERED" },
        { userId: userB.id, skillId: python.id, kind: "WANTED" },
        { userId: userB.id, skillId: guitar.id, kind: "WANTED" },
      ],
    });

    const res = await findDirectMatches(userA.id, db);
    expect(res.matches).toHaveLength(1);
    expect(res.matches[0].theyTeachYou).toHaveLength(1); // React
    expect(res.matches[0].youTeachThem).toHaveLength(2); // Python and Guitar
  });
});

