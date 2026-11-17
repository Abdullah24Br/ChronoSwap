import { describe, expect, it } from "vitest";
import { db } from "@/server/db";

// Store instants in UTC (CLAUDE.md "Time"). Prisma's pg adapter sends timestamps without an
// offset, so a database server running in a local zone (e.g. Asia/Damascus) would silently shift
// every stored time. Guard both the server setting and a real round trip.
describe("Time zone of stored instants", () => {
  it("the database session runs at UTC offset 0 (UTC locally, GMT on Neon)", async () => {
    const [row] = await db.$queryRaw<{ offset: number }[]>`SELECT extract(timezone FROM now())::int AS offset`;
    expect(row.offset).toBe(0);
  });

  it("a Date written through Prisma is the same instant in SQL", async () => {
    const instant = new Date("2026-11-19T15:00:00.000Z");
    const user = await db.user.create({
      data: { email: `tz-${Date.now()}@chronoswap.test`, passwordHash: "x", displayName: "منطقة زمنية", emailVerifiedAt: instant },
    });
    const [row] = await db.$queryRaw<{ epoch: number }[]>`
      SELECT extract(epoch FROM email_verified_at)::float8 AS epoch FROM users WHERE id = ${user.id}::uuid`;
    expect(row.epoch * 1000).toBe(instant.getTime());
  });
});
