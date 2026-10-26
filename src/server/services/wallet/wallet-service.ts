import type { PrismaClient } from "@/generated/prisma/client";
import { WELCOME_BONUS_MINUTES } from "@/lib/rules";
import { DomainError } from "@/server/errors";
import { postLedgerEntries, withWalletTransaction, type Tx } from "./ledger";

// Wallet operations used from Phase 0 (seed) onwards. Session-related
// operations (freeze / release / refund / settlement) arrive with their phases
// and must follow the same pattern: one transaction → postLedgerEntries.

export async function ensureWallet(tx: Tx, userId: string) {
  return tx.wallet.upsert({ where: { userId }, update: {}, create: { userId } });
}

/**
 * FR-1.2: grant the welcome bonus once per verified e-mail.
 * Returns false if this e-mail already received it (never throws for replays).
 */
export async function grantWelcomeBonus(client: PrismaClient, userId: string): Promise<boolean> {
  return withWalletTransaction(client, async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.emailVerifiedAt) {
      throw new DomainError("EMAIL_NOT_VERIFIED", "Welcome bonus requires a verified e-mail (FR-1.2)");
    }
    const already = await tx.welcomeBonusGrant.findUnique({ where: { email: user.email } });
    if (already) return false;

    await ensureWallet(tx, userId);
    const { applied, entries } = await postLedgerEntries(tx, [
      {
        userId,
        type: "WELCOME_BONUS",
        delta: { available: WELCOME_BONUS_MINUTES },
        idempotencyKey: `welcome:${user.email}`,
        memo: "FR-1.2 welcome bonus",
      },
    ]);
    if (!applied) return false;

    // The unique e-mail index is the final guard against a concurrent double grant.
    await tx.welcomeBonusGrant.create({
      data: { email: user.email, userId, ledgerEntryId: entries[0].id },
    });
    return true;
  });
}
