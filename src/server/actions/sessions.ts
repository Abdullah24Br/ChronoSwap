"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import { getCurrentUser } from "@/server/auth/session";
import { ForbiddenError } from "@/server/errors";
import {
  acceptSessionRequest,
  rejectSessionRequest,
  requestSession,
  withdrawSessionRequest,
} from "@/server/services/sessions/booking-service";
import { cancelAcceptedSession } from "@/server/services/sessions/cancellation-service";
import {
  requestSessionSchema,
  respondSessionRequestSchema,
} from "@/server/services/sessions/schemas";

// FR-4.1: Server action to request a learning session.
export const requestSessionAction = defineAction(
  requestSessionSchema,
  async (input) => {
    const user = await getCurrentUser();
    if (!user) {
      throw new ForbiddenError("يجب تسجيل الدخول لطلب حجز جلسة");
    }

    return requestSession(user.id, input);
  },
);

// FR-4.2: Server action for teacher to accept or reject incoming request.
export const respondSessionRequestAction = defineAction(
  respondSessionRequestSchema,
  async (input) => {
    const user = await getCurrentUser();
    if (!user) {
      throw new ForbiddenError("يجب تسجيل الدخول للرد على الطلب");
    }

    if (input.decision === "ACCEPTED") {
      return acceptSessionRequest(user.id, {
        sessionId: input.sessionId,
        meetingUrl: input.meetingUrl,
      });
    } else {
      return rejectSessionRequest(user.id, {
        sessionId: input.sessionId,
        reason: input.rejectReason,
      });
    }
  },
);

// FR-4.6 / FR-4.2: Server action for learner to withdraw a pending request.
export const withdrawSessionRequestAction = defineAction(
  z.object({ sessionId: z.string().uuid("معرف الجلسة غير صالح") }),
  async ({ sessionId }) => {
    const user = await getCurrentUser();
    if (!user) {
      throw new ForbiddenError("يجب تسجيل الدخول لسحب الطلب");
    }

    return withdrawSessionRequest(user.id, sessionId);
  },
);

// FR-4.6: Server action for participant to cancel an accepted session.
export const cancelAcceptedSessionAction = defineAction(
  z.object({
    sessionId: z.string().uuid("معرف الجلسة غير صالح"),
    reason: z.string().max(500, "سبب الإلغاء طويل جداً").optional(),
  }),
  async (input) => {
    const user = await getCurrentUser();
    if (!user) {
      throw new ForbiddenError("يجب تسجيل الدخول لإلغاء الجلسة");
    }

    return cancelAcceptedSession(user.id, input);
  },
);
