"use server";

import { defineAction } from "@/server/action";
import { getCurrentUser } from "@/server/auth/session";
import { ForbiddenError } from "@/server/errors";
import { updateSkillsSchema } from "@/server/services/skills/schemas";
import { setUserSkills } from "@/server/services/skills/skills-service";

// FR-1.3: Server action to update user's skills matrix.

export const updateSkillsAction = defineAction(updateSkillsSchema, async (input) => {
  const user = await getCurrentUser();
  if (!user) {
    throw new ForbiddenError("يجب تسجيل الدخول لتعديل مصفوفة المهارات");
  }

  return setUserSkills(user.id, input);
});

