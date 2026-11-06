import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  processDueSessionReleases,
  processSessionRelease,
} from "@/server/services/sessions/release-service";
import { acceptSessionRequest, requestSession } from "@/server/services/sessions/booking-service";
import { recordSessionAttendance } from "@/server/services/sessions/cancellation-service";

describe("48-Hour Escrow Auto-Release & Safe Fallback (Module 8: FR-8.4, FR-8.5)", () => {
  async function createTestFixture() {
    const unique = Math.random().toString(36).substring(2, 9);

    const category = await db.skillCategory.create({
      data: {
        slug: `cat-rel-${unique}`,
        nameAr: `تصنيف تحرير-${unique}`,
        nameEn: `Category Release-${unique}`,
      },
    });

    const skill = await db.skill.create({
      data: {
        categoryId: category.id,
        slug: `skill-rel-${unique}`,
        nameAr: `ريأكت متقدم-${unique}`,
        nameEn: `Advanced React-${unique}`,
      },
    });

    const learner = await db.user.create({
      data: {
        email: `learner-rel-${unique}@chronoswap.test`,
        passwordHash: "hash123",
        displayName: `أحمد المتعلم-${unique}`,
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
        email: `teacher-rel-${unique}@chronoswap.test`,
        passwordHash: "hash123",
        displayName: `منى المدرّسة-${unique}`,
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

    const startAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const session = await requestSession(learner.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      durationMinutes: 60,
      startAt,
      goal: "شرح معمق لـ Server Components و Hooks",
    });

    await acceptSessionRequest(teacher.id, { sessionId: session.id });
    await recordSessionAttendance(teacher.id, session.id, "JOIN", db, startAt);
    await recordSessionAttendance(learner.id, session.id, "JOIN", db, startAt);

    // Mark agenda tasks done
    await db.agendaTask.updateMany({
      where: { sessionId: session.id },
      data: { isDone: true, doneAt: new Date() },
    });

    return { learner, teacher, skill, category, session };
  }

  // ─────────────────────────────────────────────────────────────
  // FR-8.4: 48h timeout auto-release when learner does not take quiz
  // ─────────────────────────────────────────────────────────────

  it("FR-8.4: automatically releases hours to teacher when 48h passes in QUIZ_PENDING without quiz", async () => {
    const fixture = await createTestFixture();
    const now = new Date();
    const endedAt = new Date(now.getTime() - 49 * 60 * 60 * 1000); // 49 hours ago
    const releaseDueAt = new Date(endedAt.getTime() + 48 * 60 * 60 * 1000); // 1 hour ago

    // Move session to QUIZ_PENDING with releaseDueAt in the past
    await db.session.update({
      where: { id: fixture.session.id },
      data: {
        status: "QUIZ_PENDING",
        endedAt,
        releaseDueAt,
        completionPercent: 100,
      },
    });

    const teacherBefore = await db.wallet.findUniqueOrThrow({
      where: { userId: fixture.teacher.id },
    });
    const learnerBefore = await db.wallet.findUniqueOrThrow({
      where: { userId: fixture.learner.id },
    });

    // Run auto-release
    const result = await processSessionRelease(fixture.session.id, now);

    expect(result.status).toBe("RELEASED");
    expect(result.trigger).toBe("FR-8.4:quiz-timeout");

    // Check DB state
    const updatedSession = await db.session.findUniqueOrThrow({
      where: { id: fixture.session.id },
      include: { events: true },
    });
    expect(updatedSession.status).toBe("RELEASED");
    expect(updatedSession.settledAt).not.toBeNull();

    // Check event logged
    const event = updatedSession.events.find((e) => e.trigger === "FR-8.4:quiz-timeout");
    expect(event).toBeDefined();
    expect(event?.fromStatus).toBe("QUIZ_PENDING");
    expect(event?.toStatus).toBe("RELEASED");

    // Check financial balances
    const teacherAfter = await db.wallet.findUniqueOrThrow({
      where: { userId: fixture.teacher.id },
    });
    const learnerAfter = await db.wallet.findUniqueOrThrow({
      where: { userId: fixture.learner.id },
    });

    expect(teacherAfter.availableMinutes).toBe(teacherBefore.availableMinutes + 60);
    expect(learnerAfter.frozenMinutes).toBe(learnerBefore.frozenMinutes - 60);

    // Verify ledger
    const creditEntry = await db.ledgerEntry.findFirstOrThrow({
      where: { sessionId: fixture.session.id, type: "SESSION_RELEASE_CREDIT" },
    });
    expect(creditEntry.availableDelta).toBe(60);
  });

  it("FR-8.4: does NOT release hours before the 48h timeout arrives", async () => {
    const fixture = await createTestFixture();
    const now = new Date();
    const endedAt = new Date(now.getTime() - 20 * 60 * 60 * 1000); // Only 20 hours ago
    const releaseDueAt = new Date(endedAt.getTime() + 48 * 60 * 60 * 1000); // 28 hours in the future

    await db.session.update({
      where: { id: fixture.session.id },
      data: {
        status: "QUIZ_PENDING",
        endedAt,
        releaseDueAt,
        completionPercent: 100,
      },
    });

    const result = await processSessionRelease(fixture.session.id, now);
    expect(result.status).toBe("UNCHANGED");

    const session = await db.session.findUniqueOrThrow({
      where: { id: fixture.session.id },
    });
    expect(session.status).toBe("QUIZ_PENDING");
  });

  it("FR-8.4: strictly blocks release if session is disputed (SKIPPED_DISPUTED)", async () => {
    const fixture = await createTestFixture();
    const now = new Date();
    const endedAt = new Date(now.getTime() - 50 * 60 * 60 * 1000);
    const releaseDueAt = new Date(endedAt.getTime() + 48 * 60 * 60 * 1000);

    // Create session in QUIZ_PENDING with an active dispute
    await db.session.update({
      where: { id: fixture.session.id },
      data: {
        status: "QUIZ_PENDING",
        endedAt,
        releaseDueAt,
        completionPercent: 100,
      },
    });

    await db.dispute.create({
      data: {
        sessionId: fixture.session.id,
        source: "USER_REPORT",
        reason: "المدرّس لم يحضر الجلسة كاملة",
      },
    });

    const result = await processSessionRelease(fixture.session.id, now);
    expect(result.status).toBe("SKIPPED_DISPUTED");

    // Session remains unreleased
    const session = await db.session.findUniqueOrThrow({
      where: { id: fixture.session.id },
    });
    expect(session.status).toBe("QUIZ_PENDING");
    expect(session.settledAt).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────
  // FR-8.5: Fallback release when AI fails (session remains in ENDED)
  // ─────────────────────────────────────────────────────────────

  it("FR-8.5: automatically releases hours to teacher after 48h when AI fails (safe fallback)", async () => {
    const fixture = await createTestFixture();
    const now = new Date();
    const endedAt = new Date(now.getTime() - 49 * 60 * 60 * 1000); // 49 hours ago
    const releaseDueAt = new Date(endedAt.getTime() + 48 * 60 * 60 * 1000); // 1 hour ago

    // Session ended, AI failed -> session remained in ENDED with releaseDueAt
    await db.session.update({
      where: { id: fixture.session.id },
      data: {
        status: "ENDED",
        endedAt,
        releaseDueAt,
        completionPercent: 100,
      },
    });

    await db.aiSummary.create({
      data: {
        sessionId: fixture.session.id,
        status: "FAILED",
        errorMessage: "AI service unavailable",
      },
    });

    const teacherBefore = await db.wallet.findUniqueOrThrow({
      where: { userId: fixture.teacher.id },
    });

    // Run auto-release
    const result = await processSessionRelease(fixture.session.id, now);

    expect(result.status).toBe("RELEASED");
    expect(result.trigger).toBe("FR-8.5:window-elapsed");

    const session = await db.session.findUniqueOrThrow({
      where: { id: fixture.session.id },
      include: { events: true },
    });
    expect(session.status).toBe("RELEASED");

    const event = session.events.find((e) => e.trigger === "FR-8.5:window-elapsed");
    expect(event).toBeDefined();
    expect(event?.fromStatus).toBe("ENDED");
    expect(event?.toStatus).toBe("RELEASED");

    const teacherAfter = await db.wallet.findUniqueOrThrow({
      where: { userId: fixture.teacher.id },
    });
    expect(teacherAfter.availableMinutes).toBe(teacherBefore.availableMinutes + 60);
  });

  // ─────────────────────────────────────────────────────────────
  // Barter sessions: transition to BARTER_COMPLETED
  // ─────────────────────────────────────────────────────────────

  it("FR-8.4 / FR-8.5: transitions barter session to BARTER_COMPLETED on 48h timeout", async () => {
    const fixture = await createTestFixture();
    const now = new Date();
    const endedAt = new Date(now.getTime() - 49 * 60 * 60 * 1000);
    const releaseDueAt = new Date(endedAt.getTime() + 48 * 60 * 60 * 1000);

    const cycle = await db.barterCycle.create({
      data: {
        status: "ACTIVE",
        durationMinutes: 60,
        respondByAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await db.session.update({
      where: { id: fixture.session.id },
      data: {
        kind: "BARTER",
        escrowMinutes: 0,
        barterCycleId: cycle.id,
        status: "QUIZ_PENDING",
        endedAt,
        releaseDueAt,
        completionPercent: 100,
      },
    });

    const result = await processSessionRelease(fixture.session.id, now);
    expect(result.status).toBe("BARTER_COMPLETED");
    expect(result.trigger).toBe("FR-8.4:quiz-timeout");

    const session = await db.session.findUniqueOrThrow({
      where: { id: fixture.session.id },
      include: { events: true },
    });
    expect(session.status).toBe("BARTER_COMPLETED");
  });

  // ─────────────────────────────────────────────────────────────
  // NFR-3: Batch Job Runner
  // ─────────────────────────────────────────────────────────────

  it("NFR-3 / FR-8.4 / FR-8.5: processDueSessionReleases processes batch of eligible sessions", async () => {
    const fixture1 = await createTestFixture();
    const fixture2 = await createTestFixture();
    const now = new Date();
    const pastEndedAt = new Date(now.getTime() - 50 * 60 * 60 * 1000);
    const pastReleaseDueAt = new Date(pastEndedAt.getTime() + 48 * 60 * 60 * 1000);

    // Eligible session 1: QUIZ_PENDING
    await db.session.update({
      where: { id: fixture1.session.id },
      data: {
        status: "QUIZ_PENDING",
        endedAt: pastEndedAt,
        releaseDueAt: pastReleaseDueAt,
        completionPercent: 100,
      },
    });

    // Eligible session 2: ENDED (fallback)
    await db.session.update({
      where: { id: fixture2.session.id },
      data: {
        status: "ENDED",
        endedAt: pastEndedAt,
        releaseDueAt: pastReleaseDueAt,
        completionPercent: 100,
      },
    });

    const batchResult = await processDueSessionReleases(db, now);

    expect(batchResult.processedCount).toBeGreaterThanOrEqual(2);
    expect(batchResult.releasedCount).toBeGreaterThanOrEqual(2);

    const s1 = await db.session.findUniqueOrThrow({ where: { id: fixture1.session.id } });
    const s2 = await db.session.findUniqueOrThrow({ where: { id: fixture2.session.id } });
    expect(s1.status).toBe("RELEASED");
    expect(s2.status).toBe("RELEASED");
  });
});
