import type { PrismaClient } from "@/generated/prisma/client";
import { WELCOME_BONUS_MINUTES } from "@/lib/rules";
import { assertMinutes } from "@/lib/time";
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

/**
 * FR-2.2: Freezes the learner's available balance for a session duration.
 * Moves minutes from available to frozen.
 * Throws InsufficientBalanceError if the learner does not have enough available minutes.
 * Must be called inside the same transaction where the session is created or status moves to PENDING.
 */
export async function freezeSessionEscrow(
  tx: Tx,
  opts: {
    learnerId: string;
    sessionId: string;
    durationMinutes: number;
    actorId?: string;
    memo?: string;
  },
) {
  assertMinutes(opts.durationMinutes);
  if (opts.durationMinutes <= 0) {
    throw new DomainError("INVALID_DURATION", "مدة الجلسة يجب أن تكون أكبر من الصفر");
  }

  await ensureWallet(tx, opts.learnerId);

  const { applied, entries } = await postLedgerEntries(tx, [
    {
      userId: opts.learnerId,
      type: "SESSION_FREEZE",
      delta: {
        available: -opts.durationMinutes,
        frozen: opts.durationMinutes,
      },
      sessionId: opts.sessionId,
      idempotencyKey: `freeze:${opts.sessionId}`,
      actorId: opts.actorId ?? opts.learnerId,
      memo: opts.memo ?? `FR-2.2: تجميد رصيد لجلسة (${opts.durationMinutes} دقيقة)`,
    },
  ]);

  return {
    applied,
    entry: entries[0] ?? null,
  };
}

/**
 * Convenience transaction wrapper for freezeSessionEscrow.
 */
export async function freezeSessionEscrowTx(
  client: PrismaClient,
  opts: {
    learnerId: string;
    sessionId: string;
    durationMinutes: number;
    actorId?: string;
    memo?: string;
  },
) {
  return withWalletTransaction(client, (tx) => freezeSessionEscrow(tx, opts));
}

/**
 * FR-2.3: Releases escrow for a completed session.
 * Moves minutes from the learner's frozen balance to the teacher's wallet.
 * If the teacher has existing debt (from failed barter cycles, FR-3.4), the earned minutes
 * first repay that debt FIFO before adding to available balance.
 *
 * Idempotent: replaying with the same sessionId returns applied: false.
 */
export async function releaseSessionEscrow(
  tx: Tx,
  opts: {
    learnerId: string;
    teacherId: string;
    sessionId: string;
    durationMinutes: number;
    actorId?: string;
    memo?: string;
  },
) {
  assertMinutes(opts.durationMinutes);
  if (opts.durationMinutes <= 0) {
    throw new DomainError("INVALID_DURATION", "مدة الجلسة يجب أن تكون أكبر من الصفر");
  }

  await ensureWallet(tx, opts.learnerId);
  await ensureWallet(tx, opts.teacherId);

  // Check idempotency before applying debt updates or postings
  const existingDebit = await tx.ledgerEntry.findUnique({
    where: { idempotencyKey: `release:${opts.sessionId}:debit` },
  });
  const existingCredit = await tx.ledgerEntry.findUnique({
    where: { idempotencyKey: `release:${opts.sessionId}:credit` },
  });
  if (existingDebit && existingCredit) {
    return {
      applied: false,
      learnerEntry: existingDebit,
      teacherEntry: existingCredit,
      debtRepaidMinutes: Math.abs(existingCredit.debtDelta),
    };
  }

  // Check if teacher has outstanding debts to repay FIFO (FR-3.4)
  const debts = await tx.debt.findMany({
    where: {
      userId: opts.teacherId,
      remainingMinutes: { gt: 0 },
    },
    orderBy: { createdAt: "asc" },
  });

  let debtRepaid = 0;
  let remainingCredit = opts.durationMinutes;

  if (debts.length > 0) {
    for (const debt of debts) {
      if (remainingCredit <= 0) break;
      const repayForThisDebt = Math.min(debt.remainingMinutes, remainingCredit);
      const newRemaining = debt.remainingMinutes - repayForThisDebt;
      await tx.debt.update({
        where: { id: debt.id },
        data: {
          remainingMinutes: newRemaining,
          settledAt: newRemaining === 0 ? new Date() : null,
        },
      });
      debtRepaid += repayForThisDebt;
      remainingCredit -= repayForThisDebt;
    }
  }

  const postings = [
    {
      userId: opts.learnerId,
      type: "SESSION_RELEASE_DEBIT" as const,
      delta: {
        frozen: -opts.durationMinutes,
      },
      sessionId: opts.sessionId,
      idempotencyKey: `release:${opts.sessionId}:debit`,
      actorId: opts.actorId ?? opts.learnerId,
      memo: opts.memo ?? `FR-2.3: تحرير ساعات الجلسة من الضمان (${opts.durationMinutes} دقيقة)`,
    },
    {
      userId: opts.teacherId,
      type: "SESSION_RELEASE_CREDIT" as const,
      delta: {
        available: remainingCredit,
        debt: -debtRepaid,
      },
      sessionId: opts.sessionId,
      idempotencyKey: `release:${opts.sessionId}:credit`,
      actorId: opts.actorId ?? opts.learnerId,
      memo:
        opts.memo ??
        (debtRepaid > 0
          ? `FR-2.3: استلام ساعات جلسة (${remainingCredit} متاح، سداد دين ${debtRepaid} دقيقة)`
          : `FR-2.3: استلام ساعات الجلسة (${opts.durationMinutes} دقيقة)`),
    },
  ];

  const { applied, entries } = await postLedgerEntries(tx, postings);

  return {
    applied,
    learnerEntry: entries.find((e) => e.type === "SESSION_RELEASE_DEBIT") ?? null,
    teacherEntry: entries.find((e) => e.type === "SESSION_RELEASE_CREDIT") ?? null,
    debtRepaidMinutes: debtRepaid,
  };
}

/**
 * Convenience transaction wrapper for releaseSessionEscrow.
 */
export async function releaseSessionEscrowTx(
  client: PrismaClient,
  opts: {
    learnerId: string;
    teacherId: string;
    sessionId: string;
    durationMinutes: number;
    actorId?: string;
    memo?: string;
  },
) {
  return withWalletTransaction(client, (tx) => releaseSessionEscrow(tx, opts));
}

/**
 * FR-2.4: Automatically refunds escrow back to the learner's available balance.
 * Called when a session is rejected, auto-rejected, cancelled within policy (FR-4.6),
 * teacher absent (FR-4.6), or resolved in learner's favour by admin (FR-7.2).
 * Moves minutes from frozen to available.
 *
 * Idempotent: replaying with the same sessionId returns applied: false.
 */
export async function refundSessionEscrow(
  tx: Tx,
  opts: {
    learnerId: string;
    sessionId: string;
    durationMinutes: number;
    actorId?: string;
    memo?: string;
  },
) {
  assertMinutes(opts.durationMinutes);
  if (opts.durationMinutes <= 0) {
    throw new DomainError("INVALID_DURATION", "مدة الجلسة يجب أن تكون أكبر من الصفر");
  }

  await ensureWallet(tx, opts.learnerId);

  const { applied, entries } = await postLedgerEntries(tx, [
    {
      userId: opts.learnerId,
      type: "SESSION_REFUND",
      delta: {
        frozen: -opts.durationMinutes,
        available: opts.durationMinutes,
      },
      sessionId: opts.sessionId,
      idempotencyKey: `refund:${opts.sessionId}`,
      actorId: opts.actorId ?? opts.learnerId,
      memo: opts.memo ?? `FR-2.4: استرجاع رصيد الجلسة (${opts.durationMinutes} دقيقة)`,
    },
  ]);

  return {
    applied,
    entry: entries[0] ?? null,
  };
}

/**
 * Convenience transaction wrapper for refundSessionEscrow.
 */
export async function refundSessionEscrowTx(
  client: PrismaClient,
  opts: {
    learnerId: string;
    sessionId: string;
    durationMinutes: number;
    actorId?: string;
    memo?: string;
  },
) {
  return withWalletTransaction(client, (tx) => refundSessionEscrow(tx, opts));
}

/**
 * FR-2.1: Get user's wallet balances and ledger transactions history.
 */
export async function getWalletDashboard(client: PrismaClient, userId: string) {
  const wallet = await client.wallet.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  const entries = await client.ledgerEntry.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: "desc" },
  });

  let totalEarnedMinutes = 0;
  let totalSpentMinutes = 0;

  for (const entry of entries) {
    if (entry.availableDelta > 0) {
      totalEarnedMinutes += entry.availableDelta;
    } else if (entry.availableDelta < 0) {
      totalSpentMinutes += Math.abs(entry.availableDelta);
    }
  }

  return {
    wallet: {
      id: wallet.id,
      availableMinutes: wallet.availableMinutes,
      frozenMinutes: wallet.frozenMinutes,
      debtMinutes: wallet.debtMinutes,
      version: wallet.version,
    },
    summary: {
      totalEarnedMinutes,
      totalSpentMinutes,
      entriesCount: entries.length,
    },
    entries,
  };
}
