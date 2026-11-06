import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import { acceptSessionRequest, requestSession } from "@/server/services/sessions/booking-service";
import {
  assertSessionDurationImmutable,
  cancelAcceptedSession,
  processNoShowSessions,
  recordSessionAttendance,
} from "@/server/services/sessions/cancellation-service";

describe("Session Cancellation & No-Show Policy (FR-4.5 & FR-4.6)", () => {
  async function createTestUsersAndSkill() {
    const unique = Math.random().toString(36).substring(2, 9);

    const category = await db.skillCategory.create({
      data: {
        slug: `cat-${unique}`,
        nameAr: `تصنيف-${unique}`,
        nameEn: `Category-${unique}`,
      },
    });

    const skill = await db.skill.create({
      data: {
        categoryId: category.id,
        slug: `python-${unique}`,
        nameAr: `برمجة بايثون-${unique}`,
        nameEn: `Python-${unique}`,
      },
    });

    const learner = await db.user.create({
      data: {
        email: `learner-${unique}@chronoswap.test`,
        passwordHash: "hash123",
        displayName: `طالب-${unique}`,
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
        displayName: `أستاذ-${unique}`,
        timezone: "Asia/Damascus",
        wallet: {
          create: {
            availableMinutes: 60,
            frozenMinutes: 0,
            debtMinutes: 0,
          },
        },
      },
      include: { wallet: true },
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

    return { learner, teacher, skill };
  }

  it("allows learner to cancel an accepted session >= 12h before start with full refund (FR-4.6:cancel-in-time)", async () => {
    const { learner, teacher, skill } = await createTestUsersAndSkill();

    const startAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h in future
    const session = await requestSession(learner.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      startAt,
      durationMinutes: 60,
      goal: "تعلم بايثون المتقدم",
    });

    await acceptSessionRequest(teacher.id, { sessionId: session.id });

    // Cancel at 24 hours before startAt (isTimely = true)
    const cancelTime = new Date(startAt.getTime() - 24 * 60 * 60 * 1000);
    const result = await cancelAcceptedSession(
      learner.id,
      { sessionId: session.id, reason: "اعتذار مبكر لظرف طارئ" },
      db,
      cancelTime,
    );

    expect(result.newStatus).toBe("CANCELLED");
    expect(result.isLate).toBe(false);
    expect(result.walletOutcome).toBe("REFUNDED_TO_LEARNER");

    // Verify wallet: learner escrow refunded (available 300, frozen 0)
    const updatedLearnerWallet = await db.wallet.findUniqueOrThrow({
      where: { userId: learner.id },
    });
    expect(updatedLearnerWallet.availableMinutes).toBe(300);
    expect(updatedLearnerWallet.frozenMinutes).toBe(0);

    // Verify SessionEvent trigger
    const events = await db.sessionEvent.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "asc" },
    });
    const cancelEvent = events.find((e) => e.trigger === "FR-4.6:cancel-in-time");
    expect(cancelEvent).toBeDefined();
    expect(cancelEvent?.actorId).toBe(learner.id);
  });

  it("allows teacher to cancel an accepted session >= 12h before start with full refund to learner", async () => {
    const { learner, teacher, skill } = await createTestUsersAndSkill();

    const startAt = new Date(Date.now() + 36 * 60 * 60 * 1000);
    const session = await requestSession(learner.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      startAt,
      durationMinutes: 60,
      goal: "مراجعة خوارزميات",
    });

    await acceptSessionRequest(teacher.id, { sessionId: session.id });

    const cancelTime = new Date(startAt.getTime() - 15 * 60 * 60 * 1000); // 15h before start
    const result = await cancelAcceptedSession(
      teacher.id,
      { sessionId: session.id, reason: "ارتباط مفاجئ" },
      db,
      cancelTime,
    );

    expect(result.newStatus).toBe("CANCELLED");
    expect(result.isLate).toBe(false);
    expect(result.walletOutcome).toBe("REFUNDED_TO_LEARNER");

    const updatedLearnerWallet = await db.wallet.findUniqueOrThrow({
      where: { userId: learner.id },
    });
    expect(updatedLearnerWallet.availableMinutes).toBe(300);
    expect(updatedLearnerWallet.frozenMinutes).toBe(0);
  });

  it("marks session as NO_SHOW_TEACHER and refunds learner if teacher cancels < 12h before start", async () => {
    const { learner, teacher, skill } = await createTestUsersAndSkill();

    const startAt = new Date(Date.now() + 10 * 60 * 60 * 1000);
    const session = await requestSession(learner.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      startAt,
      durationMinutes: 60,
      goal: "جلسة برمجية",
    });

    await acceptSessionRequest(teacher.id, { sessionId: session.id });

    // Teacher cancels 3 hours before start (< 12h)
    const cancelTime = new Date(startAt.getTime() - 3 * 60 * 60 * 1000);
    const result = await cancelAcceptedSession(
      teacher.id,
      { sessionId: session.id },
      db,
      cancelTime,
    );

    expect(result.newStatus).toBe("NO_SHOW_TEACHER");
    expect(result.isLate).toBe(true);
    expect(result.walletOutcome).toBe("REFUNDED_TO_LEARNER");

    // Learner gets full refund
    const updatedLearnerWallet = await db.wallet.findUniqueOrThrow({
      where: { userId: learner.id },
    });
    expect(updatedLearnerWallet.availableMinutes).toBe(300);
    expect(updatedLearnerWallet.frozenMinutes).toBe(0);

    const event = await db.sessionEvent.findFirst({
      where: { sessionId: session.id, trigger: "FR-4.6:teacher-late-cancel" },
    });
    expect(event).toBeDefined();
  });

  it("marks session as NO_SHOW_LEARNER and transfers hours to teacher if learner cancels < 12h before start", async () => {
    const { learner, teacher, skill } = await createTestUsersAndSkill();

    const startAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const session = await requestSession(learner.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      startAt,
      durationMinutes: 60,
      goal: "جلسة برمجية",
    });

    await acceptSessionRequest(teacher.id, { sessionId: session.id });

    // Learner cancels 2 hours before start (< 12h)
    const cancelTime = new Date(startAt.getTime() - 2 * 60 * 60 * 1000);
    const result = await cancelAcceptedSession(
      learner.id,
      { sessionId: session.id },
      db,
      cancelTime,
    );

    expect(result.newStatus).toBe("NO_SHOW_LEARNER");
    expect(result.isLate).toBe(true);
    expect(result.walletOutcome).toBe("TRANSFERRED_TO_TEACHER");

    // Learner escrow is deducted (frozen 0, available 240)
    const updatedLearnerWallet = await db.wallet.findUniqueOrThrow({
      where: { userId: learner.id },
    });
    expect(updatedLearnerWallet.availableMinutes).toBe(240);
    expect(updatedLearnerWallet.frozenMinutes).toBe(0);

    // Teacher receives the 60 minutes (60 previous + 60 = 120)
    const updatedTeacherWallet = await db.wallet.findUniqueOrThrow({
      where: { userId: teacher.id },
    });
    expect(updatedTeacherWallet.availableMinutes).toBe(120);

    const event = await db.sessionEvent.findFirst({
      where: { sessionId: session.id, trigger: "FR-4.6:learner-late-cancel" },
    });
    expect(event).toBeDefined();
  });

  it("repays teacher FIFO debts when hours are transferred due to learner late cancellation (FR-2.3 + FR-3.4)", async () => {
    const { learner, teacher, skill } = await createTestUsersAndSkill();

    const startAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
    const session = await requestSession(learner.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      startAt,
      durationMinutes: 60,
      goal: "تسديد ديون مع الغياب",
    });

    await acceptSessionRequest(teacher.id, { sessionId: session.id });

    // Manually add 20 min debt to teacher to test FIFO repayment
    await db.debt.create({
      data: {
        userId: teacher.id,
        sessionId: session.id,
        originalMinutes: 20,
        remainingMinutes: 20,
      },
    });
    await db.wallet.update({
      where: { userId: teacher.id },
      data: { debtMinutes: 20 },
    });

    // Learner late cancels 1h before start
    const cancelTime = new Date(startAt.getTime() - 1 * 60 * 60 * 1000);
    await cancelAcceptedSession(
      learner.id,
      { sessionId: session.id },
      db,
      cancelTime,
    );

    const updatedTeacherWallet = await db.wallet.findUniqueOrThrow({
      where: { userId: teacher.id },
    });
    // Teacher debt cleared: 20 repaid, remaining 40 added to available (60 + 40 = 100)
    expect(updatedTeacherWallet.debtMinutes).toBe(0);
    expect(updatedTeacherWallet.availableMinutes).toBe(100);

    const debt = await db.debt.findFirst({ where: { userId: teacher.id } });
    expect(debt?.remainingMinutes).toBe(0);
  });

  it("processes automated 15-minute no-show: both absent -> NO_SHOW_BOTH and refund learner", async () => {
    const { learner, teacher, skill } = await createTestUsersAndSkill();

    const startAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours in future
    const session = await requestSession(learner.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      startAt,
      durationMinutes: 60,
      goal: "جلسة لا يحضرها أحد",
    });

    await acceptSessionRequest(teacher.id, { sessionId: session.id });

    // Run no-show job at startAt + 16 min
    const jobTime = new Date(startAt.getTime() + 16 * 60 * 1000);
    const result = await processNoShowSessions(db, jobTime);

    expect(result.noShowBothCount).toBeGreaterThanOrEqual(1);

    const updatedSession = await db.session.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(updatedSession.status).toBe("NO_SHOW_BOTH");

    const updatedLearnerWallet = await db.wallet.findUniqueOrThrow({
      where: { userId: learner.id },
    });
    expect(updatedLearnerWallet.availableMinutes).toBe(300);
    expect(updatedLearnerWallet.frozenMinutes).toBe(0);
  });

  it("processes automated 15-minute no-show: teacher absent, learner joined -> NO_SHOW_TEACHER and refund learner", async () => {
    const { learner, teacher, skill } = await createTestUsersAndSkill();

    const startAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const session = await requestSession(learner.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      startAt,
      durationMinutes: 60,
      goal: "جلسة يغيب عنها المدرّس",
    });

    await acceptSessionRequest(teacher.id, { sessionId: session.id });

    // Learner joins room at startAt + 5 min
    await recordSessionAttendance(
      learner.id,
      session.id,
      "JOIN",
      db,
      new Date(startAt.getTime() + 5 * 60 * 1000),
    );

    // Job runs at startAt + 16 min
    const jobTime = new Date(startAt.getTime() + 16 * 60 * 1000);
    const result = await processNoShowSessions(db, jobTime);

    expect(result.noShowTeacherCount).toBeGreaterThanOrEqual(1);

    const updatedSession = await db.session.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(updatedSession.status).toBe("NO_SHOW_TEACHER");

    const updatedLearnerWallet = await db.wallet.findUniqueOrThrow({
      where: { userId: learner.id },
    });
    expect(updatedLearnerWallet.availableMinutes).toBe(300);
  });

  it("processes automated 15-minute no-show: learner absent, teacher joined -> NO_SHOW_LEARNER and pay teacher", async () => {
    const { learner, teacher, skill } = await createTestUsersAndSkill();

    const startAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const session = await requestSession(learner.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      startAt,
      durationMinutes: 60,
      goal: "جلسة يغيب عنها المتعلم",
    });

    await acceptSessionRequest(teacher.id, { sessionId: session.id });

    // Teacher joins room at startAt + 3 min
    await recordSessionAttendance(
      teacher.id,
      session.id,
      "JOIN",
      db,
      new Date(startAt.getTime() + 3 * 60 * 1000),
    );

    // Job runs at startAt + 16 min
    const jobTime = new Date(startAt.getTime() + 16 * 60 * 1000);
    const result = await processNoShowSessions(db, jobTime);

    expect(result.noShowLearnerCount).toBeGreaterThanOrEqual(1);

    const updatedSession = await db.session.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(updatedSession.status).toBe("NO_SHOW_LEARNER");

    const updatedTeacherWallet = await db.wallet.findUniqueOrThrow({
      where: { userId: teacher.id },
    });
    expect(updatedTeacherWallet.availableMinutes).toBe(120); // 60 + 60
  });

  it("transitions session to IN_PROGRESS when both participants join before grace window expires (FR-5.1:both-joined)", async () => {
    const { learner, teacher, skill } = await createTestUsersAndSkill();

    const startAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const session = await requestSession(learner.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      startAt,
      durationMinutes: 60,
      goal: "جلسة تفاعلية بحضور الطرفين",
    });

    await acceptSessionRequest(teacher.id, { sessionId: session.id });

    // Teacher joins at T + 2 min
    const tJoin = await recordSessionAttendance(
      teacher.id,
      session.id,
      "JOIN",
      db,
      new Date(startAt.getTime() + 2 * 60 * 1000),
    );
    expect(tJoin.bothJoined).toBe(false);
    expect(tJoin.status).toBe("ACCEPTED");

    // Learner joins at T + 5 min
    const lJoin = await recordSessionAttendance(
      learner.id,
      session.id,
      "JOIN",
      db,
      new Date(startAt.getTime() + 5 * 60 * 1000),
    );
    expect(lJoin.bothJoined).toBe(true);
    expect(lJoin.status).toBe("IN_PROGRESS");

    const updatedSession = await db.session.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(updatedSession.status).toBe("IN_PROGRESS");
    expect(updatedSession.startedAt).toBeDefined();

    const event = await db.sessionEvent.findFirst({
      where: { sessionId: session.id, trigger: "FR-5.1:both-joined" },
    });
    expect(event).toBeDefined();
  });

  it("enforces session duration invariance (FR-4.5: no extension or modification allowed)", () => {
    // Attempting to change duration throws DomainError
    expect(() => assertSessionDurationImmutable(60, 90)).toThrow(DomainError);
    expect(() => assertSessionDurationImmutable(60, 60)).not.toThrow();
  });
});
