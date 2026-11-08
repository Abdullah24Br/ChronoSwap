import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { SessionStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { getHomeSummary } from "@/server/services/dashboard/home-summary";

afterAll(() => db.$disconnect());

const HOUR = 60 * 60_000;

async function makeUser(label: string, wallet?: { availableMinutes: number; frozenMinutes: number }) {
  return db.user.create({
    data: {
      email: `home-${label}-${randomUUID()}@chronoswap.test`,
      passwordHash: "hash",
      displayName: `مستخدم ${label}`,
      emailVerifiedAt: new Date(),
      ...(wallet ? { wallet: { create: wallet } } : {}),
    },
  });
}

describe("Signed-in home summary", () => {
  it("collects balances, what needs action, next sessions and lifetime stats for one user only", async () => {
    const unique = randomUUID();
    const category = await db.skillCategory.create({
      data: { slug: `home-cat-${unique}`, nameAr: `تصنيف ${unique.slice(0, 6)}` },
    });
    const skill = await db.skill.create({
      data: { categoryId: category.id, slug: `home-${unique}`, nameAr: "بايثون" },
    });
    const me = await makeUser("me", { availableMinutes: 90, frozenMinutes: 60 });
    const other = await makeUser("other", { availableMinutes: 0, frozenMinutes: 0 });
    await db.userSkill.create({ data: { userId: me.id, skillId: skill.id, kind: "OFFERED" } });

    let slot = 0;
    const session = (status: SessionStatus, teacherId: string, learnerId: string, startOffsetHours: number) => {
      slot += 1;
      const startAt = new Date(Date.now() + startOffsetHours * HOUR + slot * 2 * HOUR);
      return db.session.create({
        data: {
          kind: "DIRECT",
          status,
          teacherId,
          learnerId,
          skillId: skill.id,
          durationMinutes: 60,
          escrowMinutes: 60,
          goal: "جلسة للملخص",
          startAt,
          endAt: new Date(startAt.getTime() + HOUR),
        },
      });
    };

    await session("RELEASED", me.id, other.id, -200); // I taught one hour
    const learned = await session("RELEASED", other.id, me.id, -150); // I learned one hour, not rated yet
    const quiz = await session("QUIZ_PENDING", other.id, me.id, -100); // quiz waiting for me
    await session("PENDING", me.id, other.id, 30); // a request for me to answer
    const upcoming = await session("ACCEPTED", other.id, me.id, 60); // my next session
    await session("CANCELLED", me.id, other.id, -50); // never took place: not counted
    await db.user.update({ where: { id: me.id }, data: { ratingCount: 2, ratingSum: 9 } });

    const summary = await getHomeSummary(me.id);

    expect(summary.wallet).toEqual({ availableMinutes: 90, frozenMinutes: 60, debtMinutes: 0 });
    expect(summary.stats).toMatchObject({
      taughtMinutes: 60,
      learnedMinutes: 120,
      taughtCount: 1,
      learnedCount: 2,
      rating: { average: 4.5, count: 2 },
      skillsOffered: 1,
      skillsWanted: 0,
    });
    expect(summary.attention).toEqual(
      expect.arrayContaining([
        { kind: "incoming-requests", count: 1 },
        { kind: "quiz", sessionId: quiz.id, skillNameAr: "بايثون" },
        expect.objectContaining({ kind: "rate", sessionId: learned.id }),
      ]),
    );
    expect(summary.nextSessions.map((s) => [s.id, s.role])).toEqual([[upcoming.id, "learner"]]);

    // The other participant sees their own side, not mine.
    const theirs = await getHomeSummary(other.id);
    expect(theirs.stats.taughtMinutes).toBe(120);
    expect(theirs.attention.some((a) => a.kind === "incoming-requests")).toBe(false);
  });

  it("works for a user without a wallet row yet, without creating one", async () => {
    const fresh = await makeUser("fresh");
    const summary = await getHomeSummary(fresh.id);
    expect(summary.wallet).toEqual({ availableMinutes: 0, frozenMinutes: 0, debtMinutes: 0 });
    expect(await db.wallet.findUnique({ where: { userId: fresh.id } })).toBeNull();
  });
});
