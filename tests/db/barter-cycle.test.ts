import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { findThreeWayCycles } from "@/server/services/barter/barter-service";

afterAll(() => db.$disconnect());

async function makeTestUser(displayName = "مستخدم حلقة") {
  return db.user.create({
    data: {
      email: `cycle-${randomUUID()}@chronoswap.test`,
      passwordHash: "hash",
      displayName,
      emailVerifiedAt: new Date(),
      wallet: { create: {} },
    },
  });
}

async function makeThreeSkills() {
  const category = await db.skillCategory.create({
    data: {
      slug: `cat-${randomUUID()}`,
      nameAr: `تصنيف-${randomUUID().slice(0, 6)}`,
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

  const design = await db.skill.create({
    data: {
      categoryId: category.id,
      slug: `design-${randomUUID()}`,
      nameAr: "تصميم غرافيك",
    },
  });

  return { python, react, design };
}

describe("3-Way Barter Cycle Graph Engine (FR-3.3)", () => {
  it("detects a closed 3-cycle A -> B -> C -> A accurately", async () => {
    const { python, react, design } = await makeThreeSkills();

    const userA = await makeTestUser("المستخدم أ (بايثون)");
    const userB = await makeTestUser("المستخدم ب (رياكت)");
    const userC = await makeTestUser("المستخدم ج (تصميم)");

    // User A: offers Python, wants Design
    await db.userSkill.createMany({
      data: [
        { userId: userA.id, skillId: python.id, kind: "OFFERED" },
        { userId: userA.id, skillId: design.id, kind: "WANTED" },
      ],
    });

    // User B: offers React, wants Python (A -> B)
    await db.userSkill.createMany({
      data: [
        { userId: userB.id, skillId: react.id, kind: "OFFERED" },
        { userId: userB.id, skillId: python.id, kind: "WANTED" },
      ],
    });

    // User C: offers Design, wants React (B -> C, C -> A)
    await db.userSkill.createMany({
      data: [
        { userId: userC.id, skillId: design.id, kind: "OFFERED" },
        { userId: userC.id, skillId: react.id, kind: "WANTED" },
      ],
    });

    // Test from perspective of User A
    const resA = await findThreeWayCycles(userA.id, db);
    expect(resA.cycles).toHaveLength(1);

    const cycleA = resA.cycles[0];
    // Participant 0: A
    expect(cycleA.participants[0].userId).toBe(userA.id);
    expect(cycleA.participants[0].teachesSkill.id).toBe(python.id);

    // Participant 1: B
    expect(cycleA.participants[1].userId).toBe(userB.id);
    expect(cycleA.participants[1].teachesSkill.id).toBe(react.id);

    // Participant 2: C
    expect(cycleA.participants[2].userId).toBe(userC.id);
    expect(cycleA.participants[2].teachesSkill.id).toBe(design.id);

    // Role mapping for A: teaches B Python, learns from C Design
    expect(cycleA.myRole.iTeach.user.id).toBe(userB.id);
    expect(cycleA.myRole.iTeach.skill.id).toBe(python.id);
    expect(cycleA.myRole.iLearnFrom.user.id).toBe(userC.id);
    expect(cycleA.myRole.iLearnFrom.skill.id).toBe(design.id);

    // Verify all 3 participants see the cycle from their perspective
    const resB = await findThreeWayCycles(userB.id, db);
    expect(resB.cycles).toHaveLength(1);
    expect(resB.cycles[0].myRole.iTeach.user.id).toBe(userC.id); // B teaches C React
    expect(resB.cycles[0].myRole.iLearnFrom.user.id).toBe(userA.id); // B learns from A Python

    const resC = await findThreeWayCycles(userC.id, db);
    expect(resC.cycles).toHaveLength(1);
    expect(resC.cycles[0].myRole.iTeach.user.id).toBe(userA.id); // C teaches A Design
    expect(resC.cycles[0].myRole.iLearnFrom.user.id).toBe(userB.id); // C learns from B React
  });

  it("does not report a cycle if any link in the chain is broken", async () => {
    const { python, react, design } = await makeThreeSkills();

    const userA = await makeTestUser("مستخدم أ");
    const userB = await makeTestUser("مستخدم ب");
    const userC = await makeTestUser("مستخدم ج");

    // A offers Python, wants Design
    await db.userSkill.createMany({
      data: [
        { userId: userA.id, skillId: python.id, kind: "OFFERED" },
        { userId: userA.id, skillId: design.id, kind: "WANTED" },
      ],
    });

    // B offers React, wants Python
    await db.userSkill.createMany({
      data: [
        { userId: userB.id, skillId: react.id, kind: "OFFERED" },
        { userId: userB.id, skillId: python.id, kind: "WANTED" },
      ],
    });

    // C offers Design, BUT does NOT want React (link B -> C is missing!)
    await db.userSkill.createMany({
      data: [
        { userId: userC.id, skillId: design.id, kind: "OFFERED" },
        { userId: userC.id, skillId: python.id, kind: "WANTED" }, // C wants Python instead of React
      ],
    });

    const resA = await findThreeWayCycles(userA.id, db);
    expect(resA.cycles).toHaveLength(0);
  });

  it("requires 3 distinct users (does not report a 2-user cycle as 3-cycle)", async () => {
    const { python, react } = await makeThreeSkills();

    const userA = await makeTestUser("مستخدم أ");
    const userB = await makeTestUser("مستخدم ب");

    // Mutual direct exchange between A and B
    await db.userSkill.createMany({
      data: [
        { userId: userA.id, skillId: python.id, kind: "OFFERED" },
        { userId: userA.id, skillId: react.id, kind: "WANTED" },
        { userId: userB.id, skillId: react.id, kind: "OFFERED" },
        { userId: userB.id, skillId: python.id, kind: "WANTED" },
      ],
    });

    const res = await findThreeWayCycles(userA.id, db);
    expect(res.cycles).toHaveLength(0);
  });
});

