import { randomUUID } from "node:crypto";
import { Prisma, type LedgerEntry, type LedgerEntryType, type PrismaClient } from "@/generated/prisma/client";
import { assertMinutes } from "@/lib/time";
import { DomainError, InsufficientBalanceError } from "@/server/errors";

// NFR-2: the ONLY code path that changes wallet balances.
// Every change = one LedgerEntry, written in the same transaction as the
// wallet update, while the wallet row is locked (SELECT … FOR UPDATE).

export type Tx = Prisma.TransactionClient;

export interface WalletDelta {
  available?: number;
  frozen?: number;
  debt?: number;
}

export interface LedgerPosting {
  userId: string;
  type: LedgerEntryType;
  delta: WalletDelta;
  /** Required for anything a job or retry could run twice. */
  idempotencyKey?: string;
  sessionId?: string;
  barterCycleId?: string;
  disputeId?: string;
  /** NULL = system job. */
  actorId?: string;
  memo?: string;
}

export interface PostResult {
  /** false = every posting had already been applied (idempotent replay); nothing changed. */
  applied: boolean;
  entries: LedgerEntry[];
}

interface LockedWallet {
  id: string;
  user_id: string;
  available_minutes: number;
  frozen_minutes: number;
  debt_minutes: number;
  version: number;
}

/**
 * Applies postings atomically inside `tx`. Locks the affected wallets in a
 * stable order (by id) so concurrent operations cannot deadlock.
 * Throws InsufficientBalanceError if any bucket would go negative.
 */
export async function postLedgerEntries(tx: Tx, postings: LedgerPosting[]): Promise<PostResult> {
  if (postings.length === 0) return { applied: false, entries: [] };

  for (const p of postings) {
    const { available = 0, frozen = 0, debt = 0 } = p.delta;
    [available, frozen, debt].forEach(assertMinutes);
    if (available === 0 && frozen === 0 && debt === 0) {
      throw new DomainError("EMPTY_POSTING", `Ledger posting ${p.type} changes nothing`);
    }
  }

  const userIds = [...new Set(postings.map((p) => p.userId))];
  const locked = await tx.$queryRaw<LockedWallet[]>`
    SELECT id, user_id, available_minutes, frozen_minutes, debt_minutes, version
    FROM wallets
    WHERE user_id = ANY(${userIds}::uuid[])
    ORDER BY id
    FOR UPDATE`;
  const byUser = new Map(locked.map((w) => [w.user_id, { ...w }]));
  for (const id of userIds) {
    if (!byUser.has(id)) throw new DomainError("WALLET_NOT_FOUND", `No wallet for user ${id}`);
  }

  // Checked *after* taking the locks, so a concurrent duplicate sees the first one's commit.
  const keys = postings.map((p) => p.idempotencyKey).filter((k): k is string => !!k);
  if (keys.length > 0) {
    const existing = await tx.ledgerEntry.findMany({ where: { idempotencyKey: { in: keys } } });
    if (existing.length > 0) {
      if (existing.length === postings.length) return { applied: false, entries: existing };
      throw new DomainError("PARTIAL_REPLAY", "Some postings of this operation were already applied");
    }
  }

  const operationId = randomUUID();
  const entries: LedgerEntry[] = [];

  for (const p of postings) {
    const w = byUser.get(p.userId)!;
    const { available = 0, frozen = 0, debt = 0 } = p.delta;
    w.available_minutes += available;
    w.frozen_minutes += frozen;
    w.debt_minutes += debt;
    w.version += 1;
    if (w.available_minutes < 0 || w.frozen_minutes < 0 || w.debt_minutes < 0) {
      throw new InsufficientBalanceError();
    }

    entries.push(
      await tx.ledgerEntry.create({
        data: {
          walletId: w.id,
          walletVersion: w.version,
          type: p.type,
          availableDelta: available,
          frozenDelta: frozen,
          debtDelta: debt,
          availableAfter: w.available_minutes,
          frozenAfter: w.frozen_minutes,
          debtAfter: w.debt_minutes,
          operationId,
          idempotencyKey: p.idempotencyKey,
          sessionId: p.sessionId,
          barterCycleId: p.barterCycleId,
          disputeId: p.disputeId,
          actorId: p.actorId,
          memo: p.memo,
        },
      }),
    );
  }

  for (const w of byUser.values()) {
    await tx.wallet.update({
      where: { id: w.id },
      data: {
        availableMinutes: w.available_minutes,
        frozenMinutes: w.frozen_minutes,
        debtMinutes: w.debt_minutes,
        version: w.version,
      },
    });
  }

  return { applied: true, entries };
}

/** Runs `fn` in a transaction suitable for wallet work. Use for every wallet operation. */
export function withWalletTransaction<T>(client: PrismaClient, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return client.$transaction(fn, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    maxWait: 5_000,
    timeout: 10_000,
  });
}
