"use server";

import { z } from "zod";
import { defineAction } from "@/server/action";
import { getCurrentUser } from "@/server/auth/session";
import { ForbiddenError } from "@/server/errors";
import { rateTeacher } from "@/server/services/sessions/rating-service";

// FR-6.2: Rate teacher
export const rateTeacherAction = defineAction(
  z.object({
    sessionId: z.string().uuid("معرف الجلسة غير صالح"),
    stars: z.number().int().min(1).max(5),
    review: z.string().max(2000).optional(),
  }),
  async ({ sessionId, stars, review }) => {
    const user = await getCurrentUser();
    if (!user) {
      throw new ForbiddenError("يجب تسجيل الدخول لتقييم المدرّس");
    }

    return rateTeacher({
      sessionId,
      raterId: user.id,
      stars,
      review,
    });
  },
);

