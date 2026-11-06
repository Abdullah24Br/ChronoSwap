import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { SessionStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { runScheduledJobs } from "@/server/jobs/run-scheduled-jobs";
import { reconcileBarterCycles } from "@/server/services/barter/barter-service";
import { processNoShowSessions } from "@/server/services/sessions/cancellation-service";

afterAll(() => db.$disconnect());

const MINUTE = 60_000;

async function makeUser(label: string, wallet = { availableMinutes: 0, frozenMinutes: 0 }) {
  return db.user.create({
    data: {
      email: `jobs-${label.toLowerCase()}-${randomUUID()}@chronoswap.test`,
      passwordHash: "hash",
      displayName: `مستخدم ${label}`,
      emailVerifiedAt: new Date(),
      wallet: { create: wallet },
    },
  });
}

async function makeSkill() {
  const unique = randomUUID();
  const category = await db.skillCategory.create({
    data: { slug: `jobs-cat-${unique}`, nameAr: `تصنيف ${unique.slice(0, 6)}` },
  });
  return db.skill.create({
    data: { categoryId: category.id, slug: `jobs-skill-${unique}`, nameAr: "مهارة" },
  });
}

async function makeSession(opts: {
  kind: "DIRECT" | "BARTER";
  status: SessionStatus;
  learnerId: string;
  teacherId: string;
  skillId: string;
  startAt: Date;
  barterCycleId?: string;
  escrowMinutes?: number;
}) {
  return db.session.create({
    data: {
      kind: opts.kind,
      status: opts.status,
      learnerId: opts.learnerId,
      teacherId: opts.teacherId,
      skillId: opts.skillId,
      durationMinutes: 60,
      escrowMinutes: opts.escrowMinutes ?? 0,
      goal: "اختبار المهام المجدولة",
      startAt: opts.startAt,
      endAt: new Date(opts.startAt.getTime() + 60 * MINUTE),
      barterCycleId: opts.barterCycleId,
    },
  });
}

/** An ACTIVE cycle A teaches B, B teaches C, C teaches A. */
async function makeActiveCycle(scheduleByAt: Date) {
  const skill = await makeSkill();
  const a = await makeUser("A", { availableMinutes: 0, frozenMinutes: 0 });
  const b = await makeUser("B", { availableMinutes: 30, frozenMinutes: 0 });
  const c = await makeUser("C", { availableMinutes: 0, frozenMinutes: 0 });
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

describe("Scheduled jobs (NFR-3)", () => {
  it("auto-rejects an unanswered request at its start time and refunds once (FR-4.2, Q-29)", async () => {
    const skill = await makeSkill();
    const learner = await makeUser("learner", { availableMinutes: 0, frozenMinutes: 60 });
    const teacher = await makeUser("teacher");
    const session = await makeSession({
      kind: "DIRECT",
      status: "PENDING",
      learnerId: learner.id,
      teacherId: teacher.id,
      skillId: skill.id,
      startAt: new Date(Date.now() - MINUTE),
      escrowMinutes: 60,
    });

    // Two overlapping ticks must not refund twice.
    const [first, second] = await Promise.all([runScheduledJobs(), runScheduledJobs()]);
    expect(first.errors).toEqual({});
    expect(second.errors).toEqual({});
    await runScheduledJobs();

    const after = await db.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(after.status).toBe("AUTO_REJECTED");

    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: learner.id } });
    expect(wallet.availableMinutes).toBe(60);
    expect(wallet.frozenMinutes).toBe(0);

    const events = await db.sessionEvent.count({
      where: { sessionId: session.id, trigger: "FR-4.2:no-response" },
    });
    expect(events).toBe(1);
  });

  it("settles a barter learner no-show without leaving NO_SHOW_LEARNER and fails the cycle (Q-17)", async () => {
    const { cycle, skill, a, b } = await makeActiveCycle(new Date(Date.now() + 14 * 24 * 60 * MINUTE));
    // A teaches B; B (30 min available) does not show up.
    const startAt = new Date(Date.now() - 20 * MINUTE);
    const session = await makeSession({
      kind: "BARTER",
      status: "ACCEPTED",
      learnerId: b.id,
      teacherId: a.id,
      skillId: skill.id,
      startAt,
      barterCycleId: cycle.id,
    });
    await db.attendanceLog.create({
      data: { sessionId: session.id, userId: a.id, event: "JOIN", at: startAt },
    });

    await processNoShowSessions(db, new Date());

    const after = await db.session.findUniqueOrThrow({ where: { id: session.id } });
    expect(after.status).toBe("NO_SHOW_LEARNER");
    expect(after.settledAt).not.toBeNull();

    const learnerWallet = await db.wallet.findUniqueOrThrow({ where: { userId: b.id } });
    expect(learnerWallet.availableMinutes).toBe(0);
    expect(learnerWallet.debtMinutes).toBe(30);

    const teacherWallet = await db.wallet.findUniqueOrThrow({ where: { userId: a.id } });
    expect(teacherWallet.availableMinutes).toBe(60);

    const updatedCycle = await db.barterCycle.findUniqueOrThrow({ where: { id: cycle.id } });
    expect(updatedCycle.status).toBe("FAILED");
  });

  it("expires barter proposals nobody answered in time (Q-18)", async () => {
    const proposal = await db.barterCycle.create({
      data: { status: "PROPOSED", durationMinutes: 60, respondByAt: new Date(Date.now() - MINUTE) },
    });

    const result = await reconcileBarterCycles(db, new Date());
    expect(result.expiredCount).toBeGreaterThanOrEqual(1);

    const after = await db.barterCycle.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(after.status).toBe("EXPIRED");
  });

  it("completes a cycle once all three sessions are BARTER_COMPLETED (FR-3.4)", async () => {
    const { cycle, skill, a, b, c } = await makeActiveCycle(new Date(Date.now() + 14 * 24 * 60 * MINUTE));
    const base = Date.now() - 10 * 24 * 60 * MINUTE;
    const pairs = [
      [a, b],
      [b, c],
      [c, a],
    ] as const;
    const sessions = [];
    for (const [i, [teacher, learner]] of pairs.entries()) {
      sessions.push(
        await makeSession({
          kind: "BARTER", status: "BARTER_COMPLETED", learnerId: learner.id, teacherId: teacher.id,
          skillId: skill.id, startAt: new Date(base + (i + 1) * 2 * 60 * MINUTE), barterCycleId: cycle.id,
        }),
      );
    }

    await reconcileBarterCycles(db, new Date());
    await reconcileBarterCycles(db, new Date()); // idempotent

    const after = await db.barterCycle.findUniqueOrThrow({ where: { id: cycle.id } });
    expect(after.status).toBe("COMPLETED");
    const settled = await db.session.findMany({ where: { id: { in: sessions.map((s) => s.id) } } });
    expect(settled.every((s) => s.status === "BARTER_SETTLED")).toBe(true);
    expect(await db.ledgerEntry.count({ where: { barterCycleId: cycle.id } })).toBe(0);
  });

  it("fails a cycle whose sessions were not all booked in 14 days and settles the finished one (Q-18, Q-19)", async () => {
    const { cycle, skill, a, b } = await makeActiveCycle(new Date(Date.now() - MINUTE));
    // Only A→B happened; B (30 min available) pays A, the rest becomes debt.
    const done = await makeSession({
      kind: "BARTER", status: "BARTER_COMPLETED", learnerId: b.id, teacherId: a.id,
      skillId: skill.id, startAt: new Date(Date.now() - 3 * 24 * 60 * MINUTE), barterCycleId: cycle.id,
    });

    const result = await reconcileBarterCycles(db, new Date());
    expect(result.failedCount).toBeGreaterThanOrEqual(1);
    await reconcileBarterCycles(db, new Date()); // idempotent

    const after = await db.barterCycle.findUniqueOrThrow({ where: { id: cycle.id } });
    expect(after.status).toBe("FAILED");

    const settled = await db.session.findUniqueOrThrow({ where: { id: done.id } });
    expect(settled.status).toBe("RELEASED");

    const learnerWallet = await db.wallet.findUniqueOrThrow({ where: { userId: b.id } });
    expect(learnerWallet.availableMinutes).toBe(0);
    expect(learnerWallet.debtMinutes).toBe(30);
    const teacherWallet = await db.wallet.findUniqueOrThrow({ where: { userId: a.id } });
    expect(teacherWallet.availableMinutes).toBe(60);

    const transitions = await db.sessionEvent.count({
      where: { sessionId: done.id, trigger: "FR-3.4:cycle-failed" },
    });
    expect(transitions).toBe(1);
  });
});
