"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import { getCurrentUser } from "@/server/auth/session";
import { ForbiddenError } from "@/server/errors";
import { reportProblem } from "@/server/services/sessions/dispute-service";

// FR-6.4: Report a problem / open dispute
export const reportProblemAction = defineAction(
  z.object({
    sessionId: z.string().uuid("معرف الجلسة غير صالح"),
    reason: z.string().min(5, "يجب كتابة سبب واضح للاعتراض (5 أحرف على الأقل)").max(2000),
  }),
  async ({ sessionId, reason }) => {
    const user = await getCurrentUser();
    if (!user) {
      throw new ForbiddenError("يجب تسجيل الدخول لتقديم اعتراض");
    }

    return reportProblem({
      sessionId,
      userId: user.id,
      reason,
    });
  },
);

