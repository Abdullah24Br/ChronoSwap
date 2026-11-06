import { z } from "zod";
import { isValidTimeZone } from "@/lib/time";

// FR-1.4: Validation schemas for availability slots

export const slotRangeSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })
  .refine((s) => s.startMinute < s.endMinute, {
    message: "وقت البداية يجب أن يسبق وقت النهاية",
    path: ["endMinute"],
  });

export const updateAvailabilitySchema = z.object({
  timezone: z.string().min(1).refine(isValidTimeZone, "المنطقة الزمنية غير صالحة"),
  slots: z.array(slotRangeSchema),
});

export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;

