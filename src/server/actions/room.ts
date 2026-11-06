"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import { getCurrentUser } from "@/server/auth/session";
import { ForbiddenError } from "@/server/errors";
import {
  completeSessionByParticipant,
  saveSessionWorkspace,
  updateSessionMeetingUrl,
} from "@/server/services/sessions/room-service";
import { processSessionRelease } from "@/server/services/sessions/release-service";
import { expireSessionIfTimedOut } from "@/server/services/sessions/timer-service";

// FR-5.2: Update meeting URL
export const updateMeetingUrlAction = defineAction(
  z.object({
    sessionId: z.string().uuid("معرف الجلسة غير صالح"),
    meetingUrl: z.string().url("رابط المكالمة غير صالح").or(z.literal("")),
  }),
  async ({ sessionId, meetingUrl }) => {
    const user = await getCurrentUser();
    if (!user) {
      throw new ForbiddenError("يجب تسجيل الدخول لتحديث رابط المكالمة");
    }

    return updateSessionMeetingUrl(user.id, sessionId, meetingUrl);
  },
);

// FR-5.3: Save notes & code
export const saveWorkspaceAction = defineAction(
  z.object({
    sessionId: z.string().uuid("معرف الجلسة غير صالح"),
    notes: z.string(),
    code: z.string(),
    codeLanguage: z.string().max(32).optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
  }),
  async (input) => {
    const user = await getCurrentUser();
    if (!user) {
      throw new ForbiddenError("يجب تسجيل الدخول لحفظ مساحة العمل");
    }

    return saveSessionWorkspace(user.id, input);
  },
);

// FR-6.1 / FR-5.4: Complete session
export const completeSessionAction = defineAction(
  z.object({
    sessionId: z.string().uuid("معرف الجلسة غير صالح"),
  }),
  async ({ sessionId }) => {
    const user = await getCurrentUser();
    if (!user) {
      throw new ForbiddenError("يجب تسجيل الدخول لإتمام الجلسة");
    }

    return completeSessionByParticipant(user.id, sessionId);
  },
);

// FR-6.1: Handle timer expired
export const expireSessionAction = defineAction(
  z.object({
    sessionId: z.string().uuid("معرف الجلسة غير صالح"),
  }),
  async ({ sessionId }) => {
    const user = await getCurrentUser();
    if (!user) {
      throw new ForbiddenError("يجب تسجيل الدخول لتحديث حالة الجلسة");
    }

    return expireSessionIfTimedOut(sessionId);
  },
);

// FR-8.4 / FR-8.5: Trigger release after 48h timeout
export const processSessionReleaseAction = defineAction(
  z.object({
    sessionId: z.string().uuid("معرف الجلسة غير صالح"),
  }),
  async ({ sessionId }) => {
    const user = await getCurrentUser();
    if (!user) {
      throw new ForbiddenError("يجب تسجيل الدخول لتحديث حالة التحرير");
    }

    return processSessionRelease(sessionId);
  },
);



