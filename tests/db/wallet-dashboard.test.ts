import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { postLedgerEntries, withWalletTransaction } from "@/server/services/wallet/ledger";
import { getWalletDashboard, grantWelcomeBonus } from "@/server/services/wallet/wallet-service";

afterAll(() => db.$disconnect());

async function makeTestUser() {
  return db.user.create({
    data: {
      email: `wallet-user-${randomUUID()}@chronoswap.test`,
      passwordHash: "hash",
      displayName: "مستخدم المحفظة",
      emailVerifiedAt: new Date(),
      wallet: { create: {} },
    },
  });
}

describe("Wallet Dashboard Integration (FR-2.1)", () => {
  it("computes wallet balances and ledger entries correctly", async () => {
    const user = await makeTestUser();

    // Grant welcome bonus (120 min)
    await grantWelcomeBonus(db, user.id);

    // Freeze 30 min for a mock session
    await withWalletTransaction(db, (tx) =>
      postLedgerEntries(tx, [
        {
          userId: user.id,
          type: "SESSION_FREEZE",
          delta: { available: -30, frozen: 30 },
          memo: "حجز جلسة تجريبية",
        },
      ]),
    );

    const dashboard = await getWalletDashboard(db, user.id);

    // Balances
    expect(dashboard.wallet.availableMinutes).toBe(90);
    expect(dashboard.wallet.frozenMinutes).toBe(30);
    expect(dashboard.wallet.debtMinutes).toBe(0);

    // Summary
    expect(dashboard.summary.totalEarnedMinutes).toBe(120);
    expect(dashboard.summary.totalSpentMinutes).toBe(30);
    expect(dashboard.summary.entriesCount).toBe(2);

    // Entries order: newest first
    expect(dashboard.entries[0].type).toBe("SESSION_FREEZE");
    expect(dashboard.entries[1].type).toBe("WELCOME_BONUS");
  });
});

