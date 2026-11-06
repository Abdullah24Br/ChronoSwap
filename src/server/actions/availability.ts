"use server";

import { defineAction } from "@/server/action";
import { getCurrentUser } from "@/server/auth/session";
import { ForbiddenError } from "@/server/errors";
import { setUserAvailability } from "@/server/services/availability/availability-service";
import { updateAvailabilitySchema } from "@/server/services/availability/schemas";

// FR-1.4: Server Action to update user's weekly availability and timezone.

export const updateAvailabilityAction = defineAction(
  updateAvailabilitySchema,
  async (input) => {
    const user = await getCurrentUser();
    if (!user) {
      throw new ForbiddenError("يجب تسجيل الدخول لتعديل الأوقات المتاحة");
    }

    return setUserAvailability(user.id, input);
  },
);

