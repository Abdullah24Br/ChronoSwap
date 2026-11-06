import { z } from "zod";

// FR-3.1: Schema for teacher search & filtering
export const searchTeachersSchema = z.object({
  query: z.string().trim().max(100).optional(),
  skillId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  minRating: z.coerce.number().min(1).max(5).optional(),
  weekday: z.coerce.number().int().min(0).max(6).optional(),
  excludeUserId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type SearchTeachersInput = z.input<typeof searchTeachersSchema>;
export type SearchTeachersParsed = z.infer<typeof searchTeachersSchema>;
