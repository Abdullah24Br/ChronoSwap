import { describe, expect, it } from "vitest";
import { updateAvailabilitySchema } from "./schemas";

describe("Availability Slots Schema (FR-1.4)", () => {
  it("accepts valid availability slots and valid IANA timezone", () => {
    const valid = updateAvailabilitySchema.safeParse({
      timezone: "Asia/Damascus",
      slots: [
        { weekday: 0, startMinute: 540, endMinute: 780 }, // Sunday 09:00 - 13:00
        { weekday: 1, startMinute: 600, endMinute: 900 }, // Monday 10:00 - 15:00
      ],
    });

    expect(valid.success).toBe(true);
  });

  it("accepts empty slots list (user not currently available)", () => {
    const valid = updateAvailabilitySchema.safeParse({
      timezone: "Europe/Berlin",
      slots: [],
    });

    expect(valid.success).toBe(true);
  });

  it("rejects slot where startMinute >= endMinute", () => {
    const invalid = updateAvailabilitySchema.safeParse({
      timezone: "Asia/Riyadh",
      slots: [{ weekday: 0, startMinute: 600, endMinute: 500 }],
    });

    expect(invalid.success).toBe(false);
  });

  it("rejects invalid weekday (<0 or >6)", () => {
    const invalid = updateAvailabilitySchema.safeParse({
      timezone: "Asia/Damascus",
      slots: [{ weekday: 7, startMinute: 540, endMinute: 600 }],
    });

    expect(invalid.success).toBe(false);
  });

  it("rejects invalid IANA timezone string", () => {
    const invalid = updateAvailabilitySchema.safeParse({
      timezone: "Fake/Timezone_Not_Real",
      slots: [],
    });

    expect(invalid.success).toBe(false);
  });
});

