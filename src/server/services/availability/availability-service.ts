import { db } from "@/server/db";
import { DomainError, NotFoundError } from "@/server/errors";
import { hasOverlappingSlots, isValidTimeZone, type SlotRange } from "@/lib/time";

// FR-1.4: Availability Slots & Timezone Service.
// Manages weekly recurring availability slots stored in local wall-clock time
// along with the user's IANA timezone.

export interface UserAvailabilityDto {
  timezone: string;
  slots: SlotRange[];
}

/**
 * Returns the user's timezone and all weekly availability slots.
 */
export async function getUserAvailability(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, timezone: true },
  });

  if (!user) {
    throw new NotFoundError("المستخدم غير موجود");
  }

  const slots = await db.availabilitySlot.findMany({
    where: { userId },
    orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
  });

  return {
    timezone: user.timezone,
    slots: slots.map((s) => ({
      id: s.id,
      weekday: s.weekday,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
      timezone: s.timezone,
    })),
  };
}

/**
 * FR-1.4: Sets user's timezone and weekly availability slots atomically.
 * Enforces start < end, non-overlapping intervals per day, and valid IANA timezone.
 */
export async function setUserAvailability(userId: string, input: UserAvailabilityDto) {
  // Validate IANA Timezone
  if (!isValidTimeZone(input.timezone)) {
    throw new DomainError("INVALID_TIMEZONE", "المنطقة الزمنية غير صالحة");
  }

  // Validate slots ranges
  for (const slot of input.slots) {
    if (slot.weekday < 0 || slot.weekday > 6) {
      throw new DomainError("INVALID_WEEKDAY", "يوم الأسبوع يجب أن يكون بين 0 (الأحد) و 6 (السبت)");
    }
    if (slot.startMinute < 0 || slot.endMinute > 1440 || slot.startMinute >= slot.endMinute) {
      throw new DomainError("INVALID_SLOT_RANGE", "وقت بداية الفترة يجب أن يسبق وقت نهايتها");
    }
  }

  // Check for overlapping slots on any day
  if (hasOverlappingSlots(input.slots)) {
    throw new DomainError(
      "OVERLAPPING_SLOTS",
      "لا يمكن أن تتداخل الفترات الزمنية المحددة في نفس اليوم (FR-1.4)",
    );
  }

  // Atomic database update
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { timezone: input.timezone },
    });

    await tx.availabilitySlot.deleteMany({
      where: { userId },
    });

    if (input.slots.length > 0) {
      await tx.availabilitySlot.createMany({
        data: input.slots.map((s) => ({
          userId,
          weekday: s.weekday,
          startMinute: s.startMinute,
          endMinute: s.endMinute,
          timezone: input.timezone,
        })),
      });
    }
  });

  return getUserAvailability(userId);
}

