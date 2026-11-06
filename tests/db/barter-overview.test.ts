import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  getBarterBookingContext,
  getBarterOverview,
} from "@/server/services/barter/barter-overview";

afterAll(() => db.$disconnect());

async function makeUser(label: string) {
  return db.user.create({
    data: {
      email: `overview-${label}-${randomUUID()}@chronoswap.test`,
      passwordHash: "hash",
      displayName: `مستخدم ${label}`,
      emailVerifiedAt: new Date(),
      wallet: { create: {} },
    },
  });
}

async function makeCycle(status: "PROPOSED" | "ACTIVE") {
  const unique = randomUUID();
  const category = await db.skillCategory.create({
    data: { slug: `ov-cat-${unique}`, nameAr: `تصنيف ${unique.slice(0, 6)}` },
  });
  const skills = await Promise.all(
    [0, 1, 2].map((i) =>
      db.skill.create({
        data: { categoryId: category.id, slug: `ov-${i}-${unique}`, nameAr: `مهارة ${i}` },
      }),
    ),
  );
  const users = [await makeUser("a"), await makeUser("b"), await makeUser("c")];
  const cycle = await db.barterCycle.create({
    data: {
      status,
      durationMinutes: 90,
      respondByAt: new Date(Date.now() + 60 * 60_000),
      scheduleByAt: status === "ACTIVE" ? new Date(Date.now() + 24 * 60 * 60_000) : null,
      participants: {
        create: users.map((u, position) => ({
          userId: u.id,
          position,
          teachesSkillId: skills[position].id,
          decision: status === "ACTIVE" || position === 0 ? ("ACCEPTED" as const) : ("PENDING" as const),
        })),
      },
    },
  });
  return { cycle, users, skills };
}

describe("Barter overview for /barter (FR-3.4)", () => {
  it("shapes a proposal so only pending participants can respond", async () => {
    const { cycle, users } = await makeCycle("PROPOSED");

    const forA = (await getBarterOverview(users[0].id)).cycles.find((c) => c.id === cycle.id);
    const forB = (await getBarterOverview(users[1].id)).cycles.find((c) => c.id === cycle.id);
    const outsider = await makeUser("x");
    const forOutsider = await getBarterOverview(outsider.id);

    expect(forA?.canRespond).toBe(false); // the proposer accepted implicitly
    expect(forB?.canRespond).toBe(true);
    expect(forB?.legs.map((l) => [l.teacher.id, l.learner.id])).toEqual([
      [users[0].id, users[1].id],
      [users[1].id, users[2].id],
      [users[2].id, users[0].id],
    ]);
    expect(forOutsider.cycles.some((c) => c.id === cycle.id)).toBe(false);
  });

  it("offers each learner the booking of their own leg once the cycle is ACTIVE", async () => {
    const { cycle, users, skills } = await makeCycle("ACTIVE");

    // B learns from A (A is position 0 and teaches position 1).
    const forB = (await getBarterOverview(users[1].id)).cycles.find((c) => c.id === cycle.id);
    expect(forB?.bookMyLeg).toEqual({ teacherId: users[0].id, skillId: skills[0].id });

    const ctx = await getBarterBookingContext(users[1].id, cycle.id, users[0].id);
    expect(ctx).toEqual({ cycleId: cycle.id, skillId: skills[0].id, durationMinutes: 90 });

    // Wrong direction (C is not B's teacher), a non-uuid id, and an outsider are all refused.
    expect(await getBarterBookingContext(users[1].id, cycle.id, users[2].id)).toBeNull();
    expect(await getBarterBookingContext(users[1].id, "not-a-uuid", users[0].id)).toBeNull();
    const outsider = await makeUser("y");
    expect(await getBarterBookingContext(outsider.id, cycle.id, users[0].id)).toBeNull();
  });
});
