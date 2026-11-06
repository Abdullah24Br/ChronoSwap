import { z } from "zod";

// FR-4.1: Booking Request Schema
export const requestSessionSchema = z.object({
  teacherId: z.string().uuid("معرف المدرّس غير صالح"),
  skillId: z.string().uuid("معرف المهارة غير صالح"),
  startAt: z.coerce.date(),
  durationMinutes: z.union([
    z.literal(30),
    z.literal(60),
    z.literal(90),
    z.literal(120),
  ]),
  goal: z
    .string()
    .trim()
    .min(5, "يجب تحديد هدف الجلسة في 5 أحرف على الأقل")
    .max(500, "هدف الجلسة لا يمكن أن يتجاوز 500 حرف"),
  barterCycleId: z.string().uuid().optional(),
});

export type RequestSessionInput = z.infer<typeof requestSessionSchema>;

// FR-4.2: Teacher Decision Schema (Accept or Reject)
export const respondSessionRequestSchema = z.object({
  sessionId: z.string().uuid("معرف الجلسة غير صالح"),
  decision: z.enum(["ACCEPTED", "REJECTED"]),
  meetingUrl: z
    .string()
    .url("رابط الاجتماع يجب أن يكون رابطاً صحيحاً (مثال: Google Meet أو Zoom)")
    .optional()
    .or(z.literal("")),
  rejectReason: z.string().max(500, "سبب الرفض لا يتجاوز 500 حرف").optional(),
});

export type RespondSessionRequestInput = z.infer<typeof respondSessionRequestSchema>;
