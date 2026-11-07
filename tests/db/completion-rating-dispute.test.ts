import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import { acceptSessionRequest, requestSession } from "@/server/services/sessions/booking-service";
import { recordSessionAttendance } from "@/server/services/sessions/cancellation-service";
import { reportProblem } from "@/server/services/sessions/dispute-service";
import { rateTeacher } from "@/server/services/sessions/rating-service";
import {
  expireSessionIfTimedOut,
  expireTimedOutSessions,
} from "@/server/services/sessions/timer-service";

describe("Completion, Rating & Dispute System (Module 6: FR-6.1, FR-6.2, FR-6.4)", () => {
  async function createTestFixture() {
    const unique = Math.random().toString(36).substring(2, 9);

    const category = await db.skillCategory.create({
      data: {
        slug: `cat-m6-${unique}`,
        nameAr: `تصنيف م6-${unique}`,
        nameEn: `Category-M6-${unique}`,
      },
    });

    const skill = await db.skill.create({
      data: {
        categoryId: category.id,
        slug: `skill-m6-${unique}`,
        nameAr: `مهارة م6-${unique}`,
        nameEn: `Skill-M6-${unique}`,
      },
    });

    const learner = await db.user.create({
      data: {
        email: `learner-m6-${unique}@chronoswap.test`,
        passwordHash: "hash123",
        displayName: `طالب م6-${unique}`,
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
        email: `teacher-m6-${unique}@chronoswap.test`,
        passwordHash: "hash123",
        displayName: `أستاذ م6-${unique}`,
        timezone: "Asia/Damascus",
        ratingCount: 0,
        ratingSum: 0,
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

    const outsider = await db.user.create({
      data: {
        email: `outsider-m6-${unique}@chronoswap.test`,
        passwordHash: "hash123",
        displayName: `طرف غريب-${unique}`,
        timezone: "Asia/Damascus",
        wallet: {
          create: {
            availableMinutes: 100,
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

    return { learner, teacher, outsider, skill };
  }

  async function createInProgressSession(fixture: Awaited<ReturnType<typeof createTestFixture>>) {
    const startAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const session = await requestSession(fixture.learner.id, {
      teacherId: fixture.teacher.id,
      skillId: fixture.skill.id,
      durationMinutes: 60,
      startAt,
      goal: "تعلم واختبار الوحدة 6",
    });

    await acceptSessionRequest(fixture.teacher.id, {
      sessionId: session.id,
    });

    // Both join to become IN_PROGRESS
    await recordSessionAttendance(fixture.teacher.id, session.id, "JOIN", db, startAt);
    await recordSessionAttendance(fixture.learner.id, session.id, "JOIN", db, startAt);

    return session;
  }

  // ─────────────────────────────────────────────────────────────
  // FR-6.1 Tests: Timer Expiry & Low-Completion Auto-Refer
  // ─────────────────────────────────────────────────────────────

  it("FR-6.1: transitions IN_PROGRESS session to ENDED when timer expires with >= 50% agenda done", async () => {
    const fixture = await createTestFixture();
    const session = await createInProgressSession(fixture);

    // Existing agenda tasks were created on accept (fallback agenda: 3 tasks)
    const tasks = await db.agendaTask.findMany({ where: { sessionId: session.id } });
    expect(tasks.length).toBeGreaterThan(0);

    // Check >= 50% tasks
    const halfCount = Math.ceil(tasks.length / 2);
    for (let i = 0; i < halfCount; i++) {
      await db.agendaTask.update({
        where: { id: tasks[i].id },
        data: { isDone: true, doneAt: new Date(), doneById: fixture.teacher.id },
      });
    }

    // Run expiration at session.endAt + 1 second
    const expiredAt = new Date(session.endAt.getTime() + 1000);
    const res = await expireSessionIfTimedOut(session.id, expiredAt);

    expect(res.status).toBe("ENDED");
    expect(res.completionPercent).toBeGreaterThanOrEqual(50);

    const updated = await db.session.findUniqueOrThrow({
      where: { id: session.id },
      include: { events: true },
    });

    expect(updated.status).toBe("ENDED");
    expect(updated.endReason).toBe("TIMER_EXPIRED");
    expect(updated.completionPercent).toBeGreaterThanOrEqual(50);
    expect(updated.releaseDueAt).toBeTruthy();

    const timerEvent = updated.events.find((e) => e.trigger === "FR-6.1:timer-expired");
    expect(timerEvent).toBeDefined();
    expect(timerEvent?.toStatus).toBe("ENDED");
  });

  it("FR-6.1: auto-refers to DISPUTED when timer expires with < 50% agenda done", async () => {
    const fixture = await createTestFixture();
    const session = await createInProgressSession(fixture);

    // Ensure 0 tasks are done (0% < 50%)
    await db.agendaTask.updateMany({
      where: { sessionId: session.id },
      data: { isDone: false, doneAt: null, doneById: null },
    });

    const expiredAt = new Date(session.endAt.getTime() + 1000);
    const res = await expireSessionIfTimedOut(session.id, expiredAt);

    expect(res.status).toBe("DISPUTED");
    expect(res.completionPercent).toBe(0);

    const updated = await db.session.findUniqueOrThrow({
      where: { id: session.id },
      include: { dispute: true, events: true },
    });

    expect(updated.status).toBe("DISPUTED");
    expect(updated.dispute).toBeDefined();
    expect(updated.dispute?.source).toBe("LOW_COMPLETION");

    const disputeEvent = updated.events.find((e) => e.trigger === "FR-6.1:low-completion");
    expect(disputeEvent).toBeDefined();
  });

  it("FR-6.1: expireTimedOutSessions background batch job processes multiple sessions", async () => {
    const fixture = await createTestFixture();
    const session1 = await createInProgressSession(fixture);

    // Mark all tasks done for session1
    await db.agendaTask.updateMany({
      where: { sessionId: session1.id },
      data: { isDone: true, doneAt: new Date(), doneById: fixture.teacher.id },
    });

    const expiredAt = new Date(session1.endAt.getTime() + 1000);
    const jobRes = await expireTimedOutSessions(db, expiredAt);

    expect(jobRes.processedCount).toBeGreaterThanOrEqual(1);
    expect(jobRes.endedCount).toBeGreaterThanOrEqual(1);
  });

  // ─────────────────────────────────────────────────────────────
  // FR-6.2 Tests: Teacher Rating (1-5 stars + review)
  // ─────────────────────────────────────────────────────────────

  it("FR-6.2: learner can rate teacher and updates teacher's aggregates atomically", async () => {
    const fixture = await createTestFixture();
    const session = await createInProgressSession(fixture);

    // End the session
    await db.session.update({
      where: { id: session.id },
      data: {
        status: "ENDED",
        completionPercent: 100,
        releaseDueAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
    });

    const rating = await rateTeacher({
      sessionId: session.id,
      raterId: fixture.learner.id,
      stars: 5,
      review: "شرح رائع وممتاز جداً",
    });

    expect(rating.stars).toBe(5);
    expect(rating.review).toBe("شرح رائع وممتاز جداً");
    expect(rating.rateeId).toBe(fixture.teacher.id);

    // Verify teacher aggregates updated
    const teacher = await db.user.findUniqueOrThrow({
      where: { id: fixture.teacher.id },
    });
    expect(teacher.ratingCount).toBe(1);
    expect(teacher.ratingSum).toBe(5);
  });

  it("FR-6.2: rejects invalid star rating (< 1 or > 5)", async () => {
    const fixture = await createTestFixture();
    const session = await createInProgressSession(fixture);

    await db.session.update({
      where: { id: session.id },
      data: { status: "ENDED" },
    });

    await expect(
      rateTeacher({
        sessionId: session.id,
        raterId: fixture.learner.id,
        stars: 6,
      }),
    ).rejects.toThrow(DomainError);

    await expect(
      rateTeacher({
        sessionId: session.id,
        raterId: fixture.learner.id,
        stars: 0,
      }),
    ).rejects.toThrow(DomainError);
  });

  it("FR-6.2: prevents teacher from rating themselves and outsiders from rating", async () => {
    const fixture = await createTestFixture();
    const session = await createInProgressSession(fixture);

    await db.session.update({
      where: { id: session.id },
      data: { status: "ENDED" },
    });

    // Teacher cannot rate
    await expect(
      rateTeacher({
        sessionId: session.id,
        raterId: fixture.teacher.id,
        stars: 5,
      }),
    ).rejects.toThrow(DomainError);

    // Outsider cannot rate
    await expect(
      rateTeacher({
        sessionId: session.id,
        raterId: fixture.outsider.id,
        stars: 5,
      }),
    ).rejects.toThrow(DomainError);
  });

  it("FR-6.2: prevents duplicate rating for the same session", async () => {
    const fixture = await createTestFixture();
    const session = await createInProgressSession(fixture);

    await db.session.update({
      where: { id: session.id },
      data: { status: "ENDED" },
    });

    await rateTeacher({
      sessionId: session.id,
      raterId: fixture.learner.id,
      stars: 4,
    });

    await expect(
      rateTeacher({
        sessionId: session.id,
        raterId: fixture.learner.id,
        stars: 5,
      }),
    ).rejects.toThrow(DomainError);
  });

  it("FR-6.2: cannot rate an active IN_PROGRESS session", async () => {
    const fixture = await createTestFixture();
    const session = await createInProgressSession(fixture);

    await expect(
      rateTeacher({
        sessionId: session.id,
        raterId: fixture.learner.id,
        stars: 5,
      }),
    ).rejects.toThrow(DomainError);
  });

  // ─────────────────────────────────────────────────────────────
  // FR-6.4 Tests: Report Problem / Dispute System
  // ─────────────────────────────────────────────────────────────

  it("FR-6.4: participant can report a problem within the 48h window", async () => {
    const fixture = await createTestFixture();
    const session = await createInProgressSession(fixture);

    const endedAt = new Date();
    const releaseDueAt = new Date(endedAt.getTime() + 48 * 60 * 60 * 1000);

    await db.session.update({
      where: { id: session.id },
      data: {
        status: "ENDED",
        endedAt,
        releaseDueAt,
        completionPercent: 80,
      },
    });

    const dispute = await reportProblem({
      sessionId: session.id,
      userId: fixture.learner.id,
      reason: "المدرّس لم يلتزم بالوقت المحدد وكان الاتصال رديئاً",
    });

    expect(dispute.source).toBe("USER_REPORT");
    expect(dispute.openedById).toBe(fixture.learner.id);
    expect(dispute.status).toBe("OPEN");

    const updated = await db.session.findUniqueOrThrow({
      where: { id: session.id },
      include: { events: true },
    });

    expect(updated.status).toBe("DISPUTED");
    const event = updated.events.find((e) => e.trigger === "FR-6.4:report");
    expect(event).toBeDefined();
    expect(event?.actorId).toBe(fixture.learner.id);
  });

  it("FR-6.4: rejects dispute report after the 48h window has expired", async () => {
    const fixture = await createTestFixture();
    const session = await createInProgressSession(fixture);

    const pastReleaseDueAt = new Date(Date.now() - 1000); // 1 second in the past

    await db.session.update({
      where: { id: session.id },
      data: {
        status: "ENDED",
        releaseDueAt: pastReleaseDueAt,
        completionPercent: 80,
      },
    });

    await expect(
      reportProblem({
        sessionId: session.id,
        userId: fixture.learner.id,
        reason: "اعتراض متأخر جداً بعد انتهاء المهلة",
      }),
    ).rejects.toThrow(DomainError);
  });

  it("FR-6.4: rejects dispute report from non-participant", async () => {
    const fixture = await createTestFixture();
    const session = await createInProgressSession(fixture);

    await db.session.update({
      where: { id: session.id },
      data: {
        status: "ENDED",
        releaseDueAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
    });

    await expect(
      reportProblem({
        sessionId: session.id,
        userId: fixture.outsider.id,
        reason: "أنا مستخدم خارجي وأريد الاعتراض",
      }),
    ).rejects.toThrow(DomainError);
  });

  it("FR-6.4: prevents duplicate dispute report", async () => {
    const fixture = await createTestFixture();
    const session = await createInProgressSession(fixture);

    await db.session.update({
      where: { id: session.id },
      data: {
        status: "ENDED",
        releaseDueAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
    });

    await reportProblem({
      sessionId: session.id,
      userId: fixture.learner.id,
      reason: "اعتراض أول مقبول",
    });

    await expect(
      reportProblem({
        sessionId: session.id,
        userId: fixture.teacher.id,
        reason: "اعتراض ثانٍ يجب أن يُرفض",
      }),
    ).rejects.toThrow(DomainError);
  });
});
