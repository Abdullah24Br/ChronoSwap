import { z } from "zod";

// FR-3.4: Barter Proposal and Settlement validation schemas.

export const proposeBarterCycleSchema = z.object({
  durationMinutes: z.union([
    z.literal(30),
    z.literal(60),
    z.literal(90),
    z.literal(120),
  ]),
  participants: z
    .array(
      z.object({
        userId: z.string().uuid("معرف المستخدم غير صالح"),
        teachesSkillId: z.string().uuid("معرف المهارة غير صالح"),
      }),
    )
    .length(3, "يجب أن تحتوي دورة المقايضة على 3 أطراف بالضبط"),
});

export type ProposeBarterCycleInput = z.infer<typeof proposeBarterCycleSchema>;

export const respondBarterProposalSchema = z.object({
  cycleId: z.string().uuid("معرف دورة المقايضة غير صالح"),
  decision: z.enum(["ACCEPTED", "DECLINED"]),
});

export type RespondBarterProposalInput = z.infer<typeof respondBarterProposalSchema>;
