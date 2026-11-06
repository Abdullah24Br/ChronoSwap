import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { DomainError } from "@/server/errors";
import { acceptSessionRequest, requestSession } from "@/server/services/sessions/booking-service";
import {
  completeSessionByParticipant,
  getSessionRoomData,
  saveSessionWorkspace,
  updateSessionMeetingUrl,
} from "@/server/services/sessions/room-service";

describe("Interactive Session Room & Collaborative Workspace (Module 5: FR-5.1 to FR-5.5)", () => {
  async function createRoomTestFixture() {
    const unique = Math.random().toString(36).substring(2, 9);

    const category = await db.skillCategory.create({
      data: {
        slug: `cat-room-${unique}`,
        nameAr: `تصنيف الغرفة-${unique}`,
        nameEn: `Category-${unique}`,
      },
    });

    const skill = await db.skill.create({
      data: {
        categoryId: category.id,
        slug: `skill-room-${unique}`,
        nameAr: `رياكت نكست-${unique}`,
        nameEn: `React Next-${unique}`,
      },
    });

    const learner = await db.user.create({
      data: {
        email: `learner-room-${unique}@chronoswap.test`,
        passwordHash: "hash123",
        displayName: `طالب الغرفة-${unique}`,
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
        email: `teacher-room-${unique}@chronoswap.test`,
        passwordHash: "hash123",
        displayName: `أستاذ الغرفة-${unique}`,
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

    const outsider = await db.user.create({
      data: {
        email: `outsider-room-${unique}@chronoswap.test`,
        passwordHash: "hash123",
        displayName: `مستخدم خارجي-${unique}`,
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

    const startAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h future
    const session = await requestSession(learner.id, {
      teacherId: teacher.id,
      skillId: skill.id,
      startAt,
      durationMinutes: 60,
      goal: "جلسة تطبيقية في React Server Components",
    });

    return { learner, teacher, outsider, skill, session };
  }

  it("restricts room access to session participants and blocks outsiders (FR-5.1 & NFR-1)", async () => {
    const { learner, teacher, outsider, session } = await createRoomTestFixture();

    // Still PENDING -> room not ready
    await expect(getSessionRoomData(session.id, learner.id)).rejects.toThrow(
      "غرفة الجلسة غير متاحة لأن الجلسة قيد الانتظار أو تم رفضها",
    );

    // Accept session
    await acceptSessionRequest(teacher.id, { sessionId: session.id });

    // Outsider cannot access
    await expect(getSessionRoomData(session.id, outsider.id)).rejects.toThrow(
      "لا تملك صلاحية الوصول إلى غرفة هذه الجلسة",
    );

    // Learner can access
    const learnerData = await getSessionRoomData(session.id, learner.id);
    expect(learnerData.id).toBe(session.id);
    expect(learnerData.isLearner).toBe(true);
    expect(learnerData.isTeacher).toBe(false);

    // Teacher can access
    const teacherData = await getSessionRoomData(session.id, teacher.id);
    expect(teacherData.id).toBe(session.id);
    expect(teacherData.isTeacher).toBe(true);
    expect(teacherData.isLearner).toBe(false);
  });

  it("automatically records attendance logs and advances to IN_PROGRESS when both enter (FR-5.1)", async () => {
    const { learner, teacher, session } = await createRoomTestFixture();
    await acceptSessionRequest(teacher.id, { sessionId: session.id });

    // Q-8: entering a day early opens the room but is not attendance yet.
    const earlyView = await getSessionRoomData(session.id, learner.id);
    expect(earlyView.status).toBe("ACCEPTED");

    // Teacher enters room first, at the start time
    const teacherView = await getSessionRoomData(session.id, teacher.id, db, session.startAt);
    expect(teacherView.status).toBe("ACCEPTED");

    const teacherLog = await db.attendanceLog.findFirst({
      where: { sessionId: session.id, userId: teacher.id, event: "JOIN" },
    });
    expect(teacherLog).toBeDefined();

    // Learner enters room second -> triggers transition to IN_PROGRESS
    const learnerView = await getSessionRoomData(session.id, learner.id, db, session.startAt);
    expect(learnerView.status).toBe("IN_PROGRESS");
    expect(learnerView.startedAt).toBeDefined();

    const event = await db.sessionEvent.findFirst({
      where: { sessionId: session.id, trigger: "FR-5.1:both-joined" },
    });
    expect(event).toBeDefined();
  });

  it("manages external meeting URL (Google Meet / Zoom) (FR-5.2)", async () => {
    const { teacher, session } = await createRoomTestFixture();
    await acceptSessionRequest(teacher.id, { sessionId: session.id });

    // Invalid URL rejected
    await expect(
      updateSessionMeetingUrl(teacher.id, session.id, "ftp://invalid-url.com"),
    ).rejects.toThrow(DomainError);

    // Valid Google Meet link saved
    const updated = await updateSessionMeetingUrl(
      teacher.id,
      session.id,
      "https://meet.google.com/abc-defg-hij",
    );
    expect(updated.meetingUrl).toBe("https://meet.google.com/abc-defg-hij");

    const fetched = await getSessionRoomData(session.id, teacher.id);
    expect(fetched.meetingUrl).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("saves notes and code with optimistic concurrency control (FR-5.3)", async () => {
    const { teacher, session } = await createRoomTestFixture();
    await acceptSessionRequest(teacher.id, { sessionId: session.id });

    // Save initial workspace
    const ws1 = await saveSessionWorkspace(teacher.id, {
      sessionId: session.id,
      notes: "شرح معمق لدوال Next.js",
      code: "export default function Page() { return <h1>Hello</h1>; }",
      codeLanguage: "typescript",
    });

    expect(ws1.notes).toContain("Next.js");
    expect(ws1.codeLanguage).toBe("typescript");
    expect(ws1.revision).toBe(1);

    // Save second edit with expected revision = 1
    const ws2 = await saveSessionWorkspace(teacher.id, {
      sessionId: session.id,
      notes: "شرح معمق لدوال Next.js مع إضافة أمثلة",
      code: "export default function Page() { return <h1>Updated</h1>; }",
      expectedRevision: 1,
    });
    expect(ws2.revision).toBe(2);

    // Attempting edit with stale expected revision (1 instead of 2) throws concurrency error
    await expect(
      saveSessionWorkspace(teacher.id, {
        sessionId: session.id,
        notes: "تعديل متضارب",
        code: "// conflict",
        expectedRevision: 1,
      }),
    ).rejects.toThrow("تم تعديل مساحة العمل من الطرف الآخر");
  });

  it("enforces agenda threshold (50%) to complete session (FR-6.1 & FR-5.4 & FR-4.5)", async () => {
    const { teacher, learner, session } = await createRoomTestFixture();
    await acceptSessionRequest(teacher.id, { sessionId: session.id });

    // Enter room so session becomes IN_PROGRESS
    await getSessionRoomData(session.id, teacher.id);
    await getSessionRoomData(session.id, learner.id);

    // Attempting to complete with 0% checked tasks throws THRESHOLD_NOT_MET
    await expect(completeSessionByParticipant(teacher.id, session.id)).rejects.toThrow(
      "لا يمكن إتمام الجلسة قبل إنجاز 50% على الأقل",
    );

    // Check 50% or more tasks
    const tasks = await db.agendaTask.findMany({ where: { sessionId: session.id } });
    expect(tasks.length).toBeGreaterThan(0);

    const halfCount = Math.ceil(tasks.length / 2);
    for (let i = 0; i < halfCount; i++) {
      await db.agendaTask.update({
        where: { id: tasks[i].id },
        data: { isDone: true, doneAt: new Date(), doneById: teacher.id },
      });
    }

    // Now completing succeeds!
    const endedSession = await completeSessionByParticipant(learner.id, session.id);
    expect(endedSession.status).toBe("ENDED");
    expect(endedSession.endReason).toBe("COMPLETE_BUTTON");
    expect(endedSession.endedAt).toBeDefined();
    expect(endedSession.releaseDueAt).toBeDefined();

    const event = await db.sessionEvent.findFirst({
      where: { sessionId: session.id, trigger: "FR-6.1:complete-button" },
    });
    expect(event).toBeDefined();
  });

  it("permanently preserves notes and code in learning archive after completion (FR-5.5)", async () => {
    const { teacher, learner, session } = await createRoomTestFixture();
    await acceptSessionRequest(teacher.id, { sessionId: session.id });

    // Save notes & code
    await saveSessionWorkspace(teacher.id, {
      sessionId: session.id,
      notes: "ملخص محفوظ للأبد في أرشيف المتعلم",
      code: "const sum = (a, b) => a + b;",
      codeLanguage: "javascript",
    });

    // Mark tasks done and complete session
    await db.agendaTask.updateMany({
      where: { sessionId: session.id },
      data: { isDone: true, doneAt: new Date() },
    });
    await completeSessionByParticipant(teacher.id, session.id);

    // Fetch room in archive mode
    const archiveData = await getSessionRoomData(session.id, learner.id);
    expect(archiveData.status).toBe("ENDED");
    expect(archiveData.workspace?.notes).toBe("ملخص محفوظ للأبد في أرشيف المتعلم");
    expect(archiveData.workspace?.code).toBe("const sum = (a, b) => a + b;");
    expect(archiveData.agendaTasks.every((t) => t.isDone)).toBe(true);
  });
});

