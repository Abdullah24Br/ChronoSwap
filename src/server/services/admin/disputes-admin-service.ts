import type { DisputeResolution, DisputeStatus, PrismaClient } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { DomainError, ForbiddenError, NotFoundError } from "@/server/errors";
import { withWalletTransaction } from "@/server/services/wallet/ledger";
import {
  refundSessionEscrow,
  releaseSessionEscrow,
} from "@/server/services/wallet/wallet-service";

// ─────────────────────────────────────────────────────────────
// FR-7.2: Dispute Resolution & Evidence Review by Admin
// ─────────────────────────────────────────────────────────────

async function assertAdmin(userId: string, client: PrismaClient = db) {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user || user.role !== "ADMIN") {
    throw new ForbiddenError("غير مصرح: هذه العملية مخصصة لمدير النظام فقط");
  }
}

/**
 * Returns a list of disputes filtered by optional status (OPEN | RESOLVED).
 */
export async function getAdminDisputesList(
  adminId: string,
  opts?: { status?: DisputeStatus },
  client: PrismaClient = db,
) {
  await assertAdmin(adminId, client);

  return client.dispute.findMany({
    where: opts?.status ? { status: opts.status } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      openedBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      resolvedBy: {
        select: {
          id: true,
          displayName: true,
        },
      },
      session: {
        include: {
          learner: {
            select: {
              id: true,
              displayName: true,
              email: true,
            },
          },
          teacher: {
            select: {
              id: true,
              displayName: true,
              email: true,
            },
          },
          skill: {
            select: {
              nameAr: true,
            },
          },
        },
      },
    },
  });
}

/**
 * Returns full evidence for an individual dispute:
 * - Session details & participants
 * - Attendance log (evidence of join/leave times)
 * - Agenda tasks (ticked items & completion percentage)
 * - Workspace notes & shared code
 * - Quiz attempt (if any)
 * - Rating (if any)
 * - Session transition events audit trail
 */
export async function getDisputeEvidence(
  adminId: string,
  disputeId: string,
  client: PrismaClient = db,
) {
  await assertAdmin(adminId, client);

  const dispute = await client.dispute.findUnique({
    where: { id: disputeId },
    include: {
      openedBy: {
        select: {
          id: true,
          displayName: true,
          email: true,
        },
      },
      resolvedBy: {
        select: {
          id: true,
          displayName: true,
        },
      },
      session: {
        include: {
          learner: {
            select: {
              id: true,
              displayName: true,
              email: true,
              avatarUrl: true,
              timezone: true,
            },
          },
          teacher: {
            select: {
              id: true,
              displayName: true,
              email: true,
              avatarUrl: true,
              timezone: true,
            },
          },
          skill: {
            include: { category: true },
          },
          agendaTasks: {
            orderBy: { position: "asc" },
          },
          attendance: {
            orderBy: { at: "asc" },
            include: {
              user: {
                select: {
                  id: true,
                  displayName: true,
                },
              },
            },
          },
          workspace: true,
          rating: true,
          quiz: {
            include: {
              attempt: true,
              questions: true,
            },
          },
          events: {
            orderBy: { createdAt: "asc" },
            include: {
              actor: {
                select: {
                  id: true,
                  displayName: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!dispute) {
    throw new NotFoundError("ملف النزاع غير موجود");
  }

  return dispute;
}

export interface ResolveDisputeInput {
  disputeId: string;
  resolution: DisputeResolution;
  adminNote?: string;
}

/**
 * FR-7.2: Admin decides to either "refund learner" or "pay teacher".
 * Executes the state machine transition and wallet updates atomically.
 */
export async function resolveDispute(
  adminId: string,
  input: ResolveDisputeInput,
  client: PrismaClient = db,
  now: Date = new Date(),
) {
  await assertAdmin(adminId, client);

  const { disputeId, resolution, adminNote } = input;

  return withWalletTransaction(client, async (tx) => {
    const dispute = await tx.dispute.findUnique({
      where: { id: disputeId },
      include: {
        session: true,
      },
    });

    if (!dispute) {
      throw new NotFoundError("ملف النزاع غير موجود");
    }

    if (dispute.status !== "OPEN") {
      throw new DomainError("DISPUTE_ALREADY_RESOLVED", "تم الفصل في هذا النزاع مسبقاً");
    }

    const session = dispute.session;

    if (session.status !== "DISPUTED") {
      throw new DomainError("INVALID_SESSION_STATUS", "الجلسة ليست في حالة نزاع");
    }

    const note = adminNote?.trim() || "قرار تحكيم صادر عن إدارة المنصة وفق المتطلب FR-7.2";

    if (resolution === "REFUND_LEARNER") {
      // ── Outcome: Refund learner ───────────────────────────────
      const res = await tx.session.updateMany({
        where: { id: session.id, status: "DISPUTED" },
        data: {
          status: "RESOLVED_REFUNDED",
          settledAt: now,
        },
      });

      if (res.count === 0) {
        throw new DomainError("CONFLICT", "تغيرت حالة الجلسة مسبقاً");
      }

      if (session.kind === "DIRECT") {
        await refundSessionEscrow(tx, {
          learnerId: session.learnerId,
          sessionId: session.id,
          durationMinutes: session.durationMinutes,
          actorId: adminId,
          memo: `FR-7.2: استرجاع الرصيد للمتعلم بقرار الإدارة في النزاع (${note})`,
        });
      }

      await tx.sessionEvent.create({
        data: {
          sessionId: session.id,
          fromStatus: "DISPUTED",
          toStatus: "RESOLVED_REFUNDED",
          trigger: "FR-7.2:refund-learner",
          actorId: adminId,
          note: `قرار الإدارة لصالح المتعلم: ${note}`,
        },
      });
    } else if (resolution === "PAY_TEACHER") {
      // ── Outcome: Pay teacher ──────────────────────────────────
      if (session.kind === "DIRECT") {
        const res = await tx.session.updateMany({
          where: { id: session.id, status: "DISPUTED" },
          data: {
            status: "RESOLVED_RELEASED",
            settledAt: now,
          },
        });

        if (res.count === 0) {
          throw new DomainError("CONFLICT", "تغيرت حالة الجلسة مسبقاً");
        }

        // Releases escrow to teacher and repays FIFO debts first
        await releaseSessionEscrow(tx, {
          learnerId: session.learnerId,
          teacherId: session.teacherId,
          sessionId: session.id,
          durationMinutes: session.durationMinutes,
          actorId: adminId,
          memo: `FR-7.2: تحويل الرصيد للمدرّس بقرار الإدارة في النزاع (${note})`,
        });

        await tx.sessionEvent.create({
          data: {
            sessionId: session.id,
            fromStatus: "DISPUTED",
            toStatus: "RESOLVED_RELEASED",
            trigger: "FR-7.2:pay-teacher",
            actorId: adminId,
            note: `قرار الإدارة لصالح المدرّس: ${note}`,
          },
        });
      } else {
        // BARTER session
        const res = await tx.session.updateMany({
          where: { id: session.id, status: "DISPUTED" },
          data: {
            status: "BARTER_COMPLETED",
            settledAt: now,
          },
        });

        if (res.count === 0) {
          throw new DomainError("CONFLICT", "تغيرت حالة الجلسة مسبقاً");
        }

        await tx.sessionEvent.create({
          data: {
            sessionId: session.id,
            fromStatus: "DISPUTED",
            toStatus: "BARTER_COMPLETED",
            trigger: "FR-7.2:pay-teacher",
            actorId: adminId,
            note: `قرار الإدارة باعتماد جلسة المقايضة لصالح المدرّس: ${note}`,
          },
        });
      }
    } else {
      throw new DomainError("INVALID_RESOLUTION", "قرار التحكيم غير صالح");
    }

    // Update Dispute record to RESOLVED
    return tx.dispute.update({
      where: { id: disputeId },
      data: {
        status: "RESOLVED",
        resolution,
        resolvedById: adminId,
        resolvedAt: now,
        adminNote: note,
      },
    });
  });
}

