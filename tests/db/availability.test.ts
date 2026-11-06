import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  getUserAvailability,
  setUserAvailability,
} from "@/server/services/availability/availability-service";

afterAll(() => db.$disconnect());

async function makeTestUser(timezone = "Asia/Damascus") {
  return db.user.create({
    data: {
      email: `avail-user-${randomUUID()}@chronoswap.test`,
      passwordHash: "hash",
      displayName: "مستخدم الأوقات",
      timezone,
      emailVerifiedAt: new Date(),
      wallet: { create: {} },
    },
  });
}

describe("Availability Slots Integration (FR-1.4)", () => {
  it("saves and retrieves user's weekly availability slots and timezone", async () => {
    const user = await makeTestUser("Asia/Damascus");

    await setUserAvailability(user.id, {
      timezone: "Asia/Damascus",
      slots: [
        { weekday: 0, startMinute: 540, endMinute: 720 }, // Sun 09:00 - 12:00
        { weekday: 0, startMinute: 840, endMinute: 1020 }, // Sun 14:00 - 17:00
        { weekday: 2, startMinute: 600, endMinute: 900 }, // Tue 10:00 - 15:00
      ],
    });

    const result = await getUserAvailability(user.id);
    expect(result.timezone).toBe("Asia/Damascus");
    expect(result.slots).toHaveLength(3);
    expect(result.slots[0]).toMatchObject({ weekday: 0, startMinute: 540, endMinute: 720 });
    expect(result.slots[1]).toMatchObject({ weekday: 0, startMinute: 840, endMinute: 1020 });
    expect(result.slots[2]).toMatchObject({ weekday: 2, startMinute: 600, endMinute: 900 });
  });

  it("updates timezone on user and availability slots", async () => {
    const user = await makeTestUser("Asia/Damascus");

    await setUserAvailability(user.id, {
      timezone: "Europe/Berlin",
      slots: [{ weekday: 1, startMinute: 600, endMinute: 720 }],
    });

    const updatedUser = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updatedUser.timezone).toBe("Europe/Berlin");

    const result = await getUserAvailability(user.id);
    expect(result.timezone).toBe("Europe/Berlin");
    expect(result.slots[0].timezone).toBe("Europe/Berlin");
  });

  it("rejects overlapping slots on the same day", async () => {
    const user = await makeTestUser();

    await expect(
      setUserAvailability(user.id, {
        timezone: "Asia/Damascus",
        slots: [
          { weekday: 0, startMinute: 540, endMinute: 720 }, // 09:00 - 12:00
          { weekday: 0, startMinute: 660, endMinute: 840 }, // 11:00 - 14:00 (overlaps!)
        ],
      }),
    ).rejects.toThrow(/تتداخل/);
  });

  it("replaces existing slots cleanly with new ones", async () => {
    const user = await makeTestUser();

    // First save: 2 slots
    await setUserAvailability(user.id, {
      timezone: "Asia/Damascus",
      slots: [
        { weekday: 0, startMinute: 540, endMinute: 720 },
        { weekday: 1, startMinute: 540, endMinute: 720 },
      ],
    });

    let res = await getUserAvailability(user.id);
    expect(res.slots).toHaveLength(2);

    // Second save: 1 different slot
    await setUserAvailability(user.id, {
      timezone: "Asia/Damascus",
      slots: [{ weekday: 4, startMinute: 900, endMinute: 1080 }],
    });

    res = await getUserAvailability(user.id);
    expect(res.slots).toHaveLength(1);
    expect(res.slots[0].weekday).toBe(4);
  });
});

