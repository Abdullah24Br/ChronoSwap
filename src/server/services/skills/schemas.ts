import { z } from "zod";

// FR-1.3: Validation schema for skills matrix update

export const updateSkillsSchema = z
  .object({
    offeredSkillIds: z.array(z.string().uuid("معرّف المهارة غير صالح")),
    wantedSkillIds: z.array(z.string().uuid("معرّف المهارة غير صالح")),
  })
  .refine(
    (data) => {
      const offered = new Set(data.offeredSkillIds);
      return !data.wantedSkillIds.some((id) => offered.has(id));
    },
    {
      message: "لا يمكن للمهارة أن تكون معروضة ومطلوبة في الوقت نفسه",
      path: ["wantedSkillIds"],
    },
  );

export type UpdateSkillsInput = z.infer<typeof updateSkillsSchema>;

