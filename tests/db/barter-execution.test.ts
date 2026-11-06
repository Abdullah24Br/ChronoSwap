import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import {
  completeSuccessfulBarterCycle,
  hasOutstandingDebt,
  proposeBarterCycle,
  respondToBarterProposal,
  settleFailedBarterCycleSessionTx,
} from "@/server/services/barter/barter-service";
import { grantWelcomeBonus } from "@/server/services/wallet/wallet-service";

afterAll(() => db.$disconnect());

async function makeTestUser(displayName = "مستخدم مقايضة") {
  const user = await db.user.create({
    data: {
      email: `barter-exec-${randomUUID()}@chronoswap.test`,
      passwordHash: "hash",
      displayName,
      emailVerifiedAt: new Date(),
      wallet: { create: {} },
    },
  });
  return user;
}

async function makeThreeSkills() {
  const category = await db.skillCategory.create({
    data: {
      slug: `cat-${randomUUID()}`,
      nameAr: `تصنيف-${randomUUID().slice(0, 6)}`,
    },
  });

  const skill1 = await db.skill.create({
    data: {
      categoryId: category.id,
      slug: `s1-${randomUUID()}`,
      nameAr: "مهارة 1",
    },
  });

  const skill2 = await db.skill.create({
    data: {
      categoryId: category.id,
      slug: `s2-${randomUUID()}`,
      nameAr: "مهارة 2",
    },
  });

  const skill3 = await db.skill.create({
    data: {
      categoryId: category.id,
      slug: `s3-${randomUUID()}`,
      nameAr: "مهارة 3",
    },
  });

  return { skill1, skill2, skill3 };
}

describe("Barter Execution & Settlement (FR-3.4)", () => {
  it("proposes a 3-way cycle and activates it when all participants accept", async () => {
    const { skill1, skill2, skill3 } = await makeThreeSkills();

    const userA = await makeTestUser("المستخدم أ");
    const userB = await makeTestUser("المستخدم ب");
    const userC = await makeTestUser("المستخدم ج");

    // A offers s1, B offers s2, C offers s3
    await db.userSkill.createMany({
      data: [
        { userId: userA.id, skillId: skill1.id, kind: "OFFERED" },
        { userId: userB.id, skillId: skill2.id, kind: "OFFERED" },
        { userId: userC.id, skillId: skill3.id, kind: "OFFERED" },
      ],
    });

    // 1. Propose cycle (A -> B -> C -> A)
    const cycle = await proposeBarterCycle(userA.id, {
      durationMinutes: 60,
      participants: [
        { userId: userA.id, teachesSkillId: skill1.id },
        { userId: userB.id, teachesSkillId: skill2.id },
        { userId: userC.id, teachesSkillId: skill3.id },
      ],
    });

    expect(cycle.status).toBe("PROPOSED");
    expect(cycle.durationMinutes).toBe(60);
    expect(cycle.participants).toHaveLength(3);

    // Initiator (A) should be ACCEPTED immediately
    const pA = cycle.participants.find((p) => p.userId === userA.id);
    const pB = cycle.participants.find((p) => p.userId === userB.id);
    const pC = cycle.participants.find((p) => p.userId === userC.id);

    expect(pA?.decision).toBe("ACCEPTED");
    expect(pB?.decision).toBe("PENDING");
    expect(pC?.decision).toBe("PENDING");

    // 2. User B responds with ACCEPTED -> still PROPOSED
    const afterB = await respondToBarterProposal(userB.id, {
      cycleId: cycle.id,
      decision: "ACCEPTED",
    });
    expect(afterB.status).toBe("PROPOSED");

    // 3. User C responds with ACCEPTED -> all 3 accepted -> ACTIVE
    const afterC = await respondToBarterProposal(userC.id, {
      cycleId: cycle.id,
      decision: "ACCEPTED",
    });
    expect(afterC.status).toBe("ACTIVE");
    expect(afterC.activatedAt).not.toBeNull();
    expect(afterC.scheduleByAt).not.toBeNull();
  });

  it("marks the cycle as DECLINED if any participant declines", async () => {
    const { skill1, skill2, skill3 } = await makeThreeSkills();

    const userA = await makeTestUser("المستخدم أ");
    const userB = await makeTestUser("المستخدم ب");
    const userC = await makeTestUser("المستخدم ج");

    await db.userSkill.createMany({
      data: [
        { userId: userA.id, skillId: skill1.id, kind: "OFFERED" },
        { userId: userB.id, skillId: skill2.id, kind: "OFFERED" },
        { userId: userC.id, skillId: skill3.id, kind: "OFFERED" },
      ],
    });

    const cycle = await proposeBarterCycle(userA.id, {
      durationMinutes: 90,
      participants: [
        { userId: userA.id, teachesSkillId: skill1.id },
        { userId: userB.id, teachesSkillId: skill2.id },
        { userId: userC.id, teachesSkillId: skill3.id },
      ],
    });

    // User B declines
    const afterB = await respondToBarterProposal(userB.id, {
      cycleId: cycle.id,
      decision: "DECLINED",
    });

    expect(afterB.status).toBe("DECLINED");
    expect(afterB.resolvedAt).not.toBeNull();

    // Trying to respond after decline throws error
    await expect(
      respondToBarterProposal(userC.id, {
        cycleId: cycle.id,
        decision: "ACCEPTED",
      }),
    ).rejects.toThrow(DomainError);
  });

  it("prevents users with outstanding debt from initiating or joining a cycle (Q-16)", async () => {
    const { skill1, skill2, skill3 } = await makeThreeSkills();

    const userA = await makeTestUser("المستخدم أ");
    const userB = await makeTestUser("المستخدم ب");
    const userC = await makeTestUser("المستخدم ج");

    await db.userSkill.createMany({
      data: [
        { userId: userA.id, skillId: skill1.id, kind: "OFFERED" },
        { userId: userB.id, skillId: skill2.id, kind: "OFFERED" },
        { userId: userC.id, skillId: skill3.id, kind: "OFFERED" },
      ],
    });

    // Manually give userA some debt
    await db.wallet.update({
      where: { userId: userA.id },
      data: { debtMinutes: 30 },
    });

    expect(await hasOutstandingDebt(userA.id)).toBe(true);

    // Initiator in debt cannot propose
    await expect(
      proposeBarterCycle(userA.id, {
        durationMinutes: 60,
        participants: [
          { userId: userA.id, teachesSkillId: skill1.id },
          { userId: userB.id, teachesSkillId: skill2.id },
          { userId: userC.id, teachesSkillId: skill3.id },
        ],
      }),
    ).rejects.toThrow("ديون سابقة غير مسددة");
  });

  it("settles failed cycle session when learner has sufficient available balance", async () => {
    const { skill1 } = await makeThreeSkills();
    const learner = await makeTestUser("المتعلم");
    const teacher = await makeTestUser("المعلم");

    // Grant welcome bonus (120 min) to learner
    await grantWelcomeBonus(db, learner.id);

    // Create a barter cycle
    const cycle = await db.barterCycle.create({
      data: {
        status: "ACTIVE",
        durationMinutes: 60,
        respondByAt: new Date(),
      },
    });

    // Create a barter session in the cycle
    const now = new Date();
    const session = await db.session.create({
      data: {
        kind: "BARTER",
        status: "BARTER_COMPLETED",
        learnerId: learner.id,
        teacherId: teacher.id,
        skillId: skill1.id,
        durationMinutes: 60,
        escrowMinutes: 0,
        goal: "جلسة مقايضة مكتملة",
        startAt: now,
        endAt: new Date(now.getTime() + 60 * 60 * 1000),
        barterCycleId: cycle.id,
      },
    });

    // Settle failed cycle session
    const res = await settleFailedBarterCycleSessionTx(db, {
      sessionId: session.id,
    });

    expect(res.applied).toBe(true);
    expect(res.debtCreatedMinutes).toBe(0);
    expect(res.debtRepaidMinutes).toBe(0);

    // Check learner wallet: 120 - 60 = 60
    const learnerWallet = await db.wallet.findUniqueOrThrow({
      where: { userId: learner.id },
    });
    expect(learnerWallet.availableMinutes).toBe(60);
    expect(learnerWallet.debtMinutes).toBe(0);

    // Check teacher wallet: 0 + 60 = 60
    const teacherWallet = await db.wallet.findUniqueOrThrow({
      where: { userId: teacher.id },
    });
    expect(teacherWallet.availableMinutes).toBe(60);
    expect(teacherWallet.debtMinutes).toBe(0);

    // Check cycle status is FAILED
    const updatedCycle = await db.barterCycle.findUniqueOrThrow({
      where: { id: cycle.id },
    });
    expect(updatedCycle.status).toBe("FAILED");

    // Check session status is RELEASED
    const updatedSession = await db.session.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(updatedSession.status).toBe("RELEASED");
    expect(updatedSession.settledAt).not.toBeNull();
  });

  it("settles failed cycle session when learner has insufficient balance, creating debt and blocking requests", async () => {
    const { skill1 } = await makeThreeSkills();
    const learner = await makeTestUser("متعلم فقير بالرصيد");
    const teacher = await makeTestUser("معلم دائن");

    // Learner has only 15 minutes available
    await db.wallet.update({
      where: { userId: learner.id },
      data: { availableMinutes: 15 },
    });

    const cycle = await db.barterCycle.create({
      data: {
        status: "ACTIVE",
        durationMinutes: 60,
        respondByAt: new Date(),
      },
    });

    const now = new Date();
    const session = await db.session.create({
      data: {
        kind: "BARTER",
        status: "BARTER_COMPLETED",
        learnerId: learner.id,
        teacherId: teacher.id,
        skillId: skill1.id,
        durationMinutes: 60,
        escrowMinutes: 0,
        goal: "جلسة مقايضة للتعثر",
        startAt: now,
        endAt: new Date(now.getTime() + 60 * 60 * 1000),
        barterCycleId: cycle.id,
      },
    });

    // Teacher also has a pre-existing 10-minute debt to test FIFO debt repayment on earnings!
    const oldCycle = await db.barterCycle.create({
      data: {
        status: "FAILED",
        durationMinutes: 30,
        respondByAt: new Date(),
      },
    });
    const oldSession = await db.session.create({
      data: {
        kind: "BARTER",
        status: "RELEASED",
        learnerId: learner.id,
        teacherId: teacher.id,
        skillId: skill1.id,
        durationMinutes: 30,
        escrowMinutes: 0,
        goal: "جلسة قديمة",
        startAt: now,
        endAt: new Date(now.getTime() + 30 * 60 * 1000),
        barterCycleId: oldCycle.id,
      },
    });

    const teacherDebt = await db.debt.create({
      data: {
        userId: teacher.id,
        sessionId: oldSession.id,
        originalMinutes: 10,
        remainingMinutes: 10,
      },
    });
    await db.wallet.update({
      where: { userId: teacher.id },
      data: { debtMinutes: 10 },
    });

    // Execute settlement
    const res = await settleFailedBarterCycleSessionTx(db, {
      sessionId: session.id,
    });

    expect(res.applied).toBe(true);
    expect(res.debtCreatedMinutes).toBe(45); // 60 - 15 = 45
    expect(res.debtRepaidMinutes).toBe(10); // Teacher's 10m debt paid

    // Learner wallet: available went from 15 to 0; debt went to 45
    const learnerWallet = await db.wallet.findUniqueOrThrow({
      where: { userId: learner.id },
    });
    expect(learnerWallet.availableMinutes).toBe(0);
    expect(learnerWallet.debtMinutes).toBe(45);

    // Debt record was created for learner
    const debtRow = await db.debt.findFirst({
      where: { userId: learner.id, sessionId: session.id },
    });
    expect(debtRow).not.toBeNull();
    expect(debtRow?.originalMinutes).toBe(45);
    expect(debtRow?.remainingMinutes).toBe(45);
    expect(debtRow?.settledAt).toBeNull();

    // Teacher wallet: received 60 minutes -> 10 repaid debt (debt = 0), remaining 50 added to available
    const teacherWallet = await db.wallet.findUniqueOrThrow({
      where: { userId: teacher.id },
    });
    expect(teacherWallet.debtMinutes).toBe(0);
    expect(teacherWallet.availableMinutes).toBe(50);

    // Teacher's debt row marked settled
    const updatedTeacherDebt = await db.debt.findUniqueOrThrow({
      where: { id: teacherDebt.id },
    });
    expect(updatedTeacherDebt.remainingMinutes).toBe(0);
    expect(updatedTeacherDebt.settledAt).not.toBeNull();

    // Learner is now detected as having outstanding debt
    expect(await hasOutstandingDebt(learner.id)).toBe(true);

    // Idempotency: replaying settlement does not re-apply
    const replay = await settleFailedBarterCycleSessionTx(db, {
      sessionId: session.id,
    });
    expect(replay.applied).toBe(false);
  });

  it("completes a fully successful barter cycle without transferring any ledger balance", async () => {
    const { skill1, skill2, skill3 } = await makeThreeSkills();
    const userA = await makeTestUser("أ");
    const userB = await makeTestUser("ب");
    const userC = await makeTestUser("ج");

    const cycle = await db.barterCycle.create({
      data: {
        status: "ACTIVE",
        durationMinutes: 60,
        respondByAt: new Date(),
      },
    });

    const now = new Date();
    // 3 completed barter sessions: A -> B, B -> C, C -> A
    const s1 = await db.session.create({
      data: {
        kind: "BARTER",
        status: "BARTER_COMPLETED",
        learnerId: userB.id,
        teacherId: userA.id,
        skillId: skill1.id,
        durationMinutes: 60,
        escrowMinutes: 0,
        goal: "جلسة 1",
        startAt: now,
        endAt: new Date(now.getTime() + 60 * 60 * 1000),
        barterCycleId: cycle.id,
      },
    });

    const s2 = await db.session.create({
      data: {
        kind: "BARTER",
        status: "BARTER_COMPLETED",
        learnerId: userC.id,
        teacherId: userB.id,
        skillId: skill2.id,
        durationMinutes: 60,
        escrowMinutes: 0,
        goal: "جلسة 2",
        startAt: now,
        endAt: new Date(now.getTime() + 60 * 60 * 1000),
        barterCycleId: cycle.id,
      },
    });

    const s3 = await db.session.create({
      data: {
        kind: "BARTER",
        status: "BARTER_COMPLETED",
        learnerId: userA.id,
        teacherId: userC.id,
        skillId: skill3.id,
        durationMinutes: 60,
        escrowMinutes: 0,
        goal: "جلسة 3",
        startAt: now,
        endAt: new Date(now.getTime() + 60 * 60 * 1000),
        barterCycleId: cycle.id,
      },
    });

    const completedCycle = await completeSuccessfulBarterCycle(db, cycle.id);
    expect(completedCycle.status).toBe("COMPLETED");

    // All 3 sessions should now be BARTER_SETTLED
    const sessions = await db.session.findMany({
      where: { id: { in: [s1.id, s2.id, s3.id] } },
    });
    expect(sessions.every((s) => s.status === "BARTER_SETTLED")).toBe(true);

    // No ledger entries were written for these sessions
    const ledgerCount = await db.ledgerEntry.count({
      where: { barterCycleId: cycle.id },
    });
    expect(ledgerCount).toBe(0);
  });
});
