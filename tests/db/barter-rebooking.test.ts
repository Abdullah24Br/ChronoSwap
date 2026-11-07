import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { SessionStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { getBarterOverview } from "@/server/services/barter/barter-overview";
import { reconcileBarterCycles } from "@/server/services/barter/barter-service";
import { requestSession } from "@/server/services/sessions/booking-service";

afterAll(() => db.$disconnect());

const MINUTE = 60_000;

async function makeUser(label: string) {
  return db.user.create({
    data: {
      email: `rebook-${label}-${randomUUID()}@chronoswap.test`,
      passwordHash: "hash",
      displayName: `مستخدم ${label}`,
      emailVerifiedAt: new Date(),
      timezone: "UTC",
      wallet: { create: {} },
    },
  });
}

/** ACTIVE cycle A→B→C→A; A offers its skill with all-day availability so B can book A. */
async function makeCycle(scheduleByAt = new Date(Date.now() + 14 * 24 * 60 * MINUTE)) {
  const unique = randomUUID();
  const category = await db.skillCategory.create({
    data: { slug: `rb-cat-${unique}`, nameAr: `تصنيف ${unique.slice(0, 6)}` },
  });
  const skill = await db.skill.create({
    data: { categoryId: category.id, slug: `rb-${unique}`, nameAr: "مهارة" },
  });
  const [a, b, c] = [await makeUser("a"), await makeUser("b"), await makeUser("c")];
  for (const u of [a, b, c]) {
    await db.userSkill.create({ data: { userId: u.id, skillId: skill.id, kind: "OFFERED" } });
  }
  await db.availabilitySlot.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      userId: a.id,
      weekday,
      startMinute: 0,
      endMinute: 1440,
      timezone: "UTC",
    })),
  });
  const cycle = await db.barterCycle.create({
    data: {
      status: "ACTIVE",
      durationMinutes: 60,
      respondByAt: new Date(),
      activatedAt: new Date(),
      scheduleByAt,
      participants: {
        create: [a, b, c].map((u, position) => ({
          userId: u.id,
          position,
          teachesSkillId: skill.id,
          decision: "ACCEPTED" as const,
        })),
      },
    },
  });
  return { cycle, skill, a, b, c };
}

function bookAtoB(ctx: Awaited<ReturnType<typeof makeCycle>>, hoursAhead: number) {
  const startAt = new Date(Date.now() + hoursAhead * 60 * MINUTE);
  startAt.setUTCMinutes(0, 0, 0);
  return requestSession(ctx.b.id, {
    teacherId: ctx.a.id,
    skillId: ctx.skill.id,
    startAt,
    durationMinutes: 60,
    goal: "جلسة ضمن حلقة مقايضة",
    barterCycleId: ctx.cycle.id,
  });
}

describe("Barter leg re-booking (Q-18 decision)", () => {
  it("lets the learner re-book a rejected leg, but never hold two live requests for it", async () => {
    const ctx = await makeCycle();

    const first = await bookAtoB(ctx, 5);
    await expect(bookAtoB(ctx, 8)).rejects.toMatchObject({ code: "BARTER_LEG_BOOKED" });

    await db.session.update({ where: { id: first.id }, data: { status: "REJECTED" } });

    const overview = await getBarterOverview(ctx.b.id);
    const cycle = overview.cycles.find((c) => c.id === ctx.cycle.id);
    expect(cycle?.bookMyLeg).toEqual({ teacherId: ctx.a.id, skillId: ctx.skill.id });

    const second = await bookAtoB(ctx, 8);
    expect(second.status).toBe("PENDING");

    const after = (await getBarterOverview(ctx.b.id)).cycles.find((c) => c.id === ctx.cycle.id);
    expect(after?.bookMyLeg).toBeNull();
    expect(after?.legs.find((l) => l.learner.id === ctx.b.id)?.session?.id).toBe(second.id);
  });

  it("enforces one live session per leg in the database itself", async () => {
    const ctx = await makeCycle();
    const base = {
      kind: "BARTER" as const,
      learnerId: ctx.b.id,
      teacherId: ctx.a.id,
      skillId: ctx.skill.id,
      durationMinutes: 60,
      escrowMinutes: 0,
      goal: "قيد قاعدة البيانات",
      barterCycleId: ctx.cycle.id,
    };
    const at = (h: number) => {
      const startAt = new Date(Date.now() + h * 60 * MINUTE);
      return { startAt, endAt: new Date(startAt.getTime() + 60 * MINUTE) };
    };
    await db.session.create({ data: { ...base, status: "CANCELLED" as SessionStatus, ...at(10) } });
    await db.session.create({ data: { ...base, status: "PENDING" as SessionStatus, ...at(12) } });
    await expect(
      db.session.create({ data: { ...base, status: "PENDING" as SessionStatus, ...at(14) } }),
    ).rejects.toThrow();
  });

  it("refuses requests after the 14-day deadline and fails the cycle (Q-18)", async () => {
    const ctx = await makeCycle(new Date(Date.now() - MINUTE));
    await expect(bookAtoB(ctx, 5)).rejects.toMatchObject({ code: "BARTER_DEADLINE_PASSED" });

    const overview = (await getBarterOverview(ctx.b.id)).cycles.find((c) => c.id === ctx.cycle.id);
    expect(overview?.bookMyLeg).toBeNull();

    await reconcileBarterCycles(db, new Date());
    const cycle = await db.barterCycle.findUniqueOrThrow({ where: { id: ctx.cycle.id } });
    expect(cycle.status).toBe("FAILED");
  });
});
