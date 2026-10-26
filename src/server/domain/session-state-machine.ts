import type { SessionKind, SessionStatus } from "@/generated/prisma/enums";

// Single source of truth for session status transitions.
// docs/SESSION_STATE_MACHINE.md mirrors this table (a test keeps them in sync).
// Services must change status with a compare-and-set:
//   tx.session.updateMany({ where: { id, status: from }, data: { status: to } })  → count must be 1
// and append a SessionEvent with the transition's `trigger`.

export type TransitionActor = "learner" | "teacher" | "participant" | "admin" | "system";

/** What happens to the hours. Implemented by the wallet service of the relevant phase. */
export type WalletEffect =
  | "none"
  | "refund-learner" // FR-2.4: learner frozen → learner available (no-op for BARTER: escrow is 0)
  | "release-to-teacher" // FR-2.3: learner frozen → teacher available (debt first, FR-3.4)
  | "barter-settle" // FR-3.4: learner available (then debt) → teacher available
  | "barter-hold"; // FR-3.4: no transfer yet, waits for the cycle outcome

export interface Transition {
  from: SessionStatus;
  to: SessionStatus;
  /** "FR-x.y:verb" — also stored in SessionEvent.trigger. */
  trigger: string;
  actor: TransitionActor;
  kinds: readonly SessionKind[];
  wallet: WalletEffect;
}

const BOTH: readonly SessionKind[] = ["DIRECT", "BARTER"];
const DIRECT: readonly SessionKind[] = ["DIRECT"];
const BARTER: readonly SessionKind[] = ["BARTER"];

/** Creation (no `from`): FR-4.1 request → PENDING. DIRECT freezes hours (FR-2.2); BARTER does not (FR-3.4). */
export const INITIAL_STATUS: SessionStatus = "PENDING";

export const TRANSITIONS: readonly Transition[] = [
  // ── Request phase ──────────────────────────────────────────────
  { from: "PENDING", to: "ACCEPTED", trigger: "FR-4.2:accept", actor: "teacher", kinds: BOTH, wallet: "none" },
  { from: "PENDING", to: "REJECTED", trigger: "FR-4.2:reject", actor: "teacher", kinds: BOTH, wallet: "refund-learner" },
  { from: "PENDING", to: "AUTO_REJECTED", trigger: "FR-4.2:no-response", actor: "system", kinds: BOTH, wallet: "refund-learner" },
  { from: "PENDING", to: "AUTO_REJECTED", trigger: "FR-4.2:slot-taken", actor: "system", kinds: BOTH, wallet: "refund-learner" },
  { from: "PENDING", to: "CANCELLED", trigger: "FR-4.6:learner-withdraw", actor: "learner", kinds: BOTH, wallet: "refund-learner" },

  // ── Accepted, before start ─────────────────────────────────────
  { from: "ACCEPTED", to: "CANCELLED", trigger: "FR-4.6:cancel-in-time", actor: "participant", kinds: BOTH, wallet: "refund-learner" },
  { from: "ACCEPTED", to: "NO_SHOW_TEACHER", trigger: "FR-4.6:teacher-late-cancel", actor: "teacher", kinds: BOTH, wallet: "refund-learner" },
  { from: "ACCEPTED", to: "NO_SHOW_LEARNER", trigger: "FR-4.6:learner-late-cancel", actor: "learner", kinds: DIRECT, wallet: "release-to-teacher" },
  { from: "ACCEPTED", to: "NO_SHOW_LEARNER", trigger: "FR-4.6:learner-late-cancel", actor: "learner", kinds: BARTER, wallet: "barter-settle" },
  { from: "ACCEPTED", to: "IN_PROGRESS", trigger: "FR-5.1:both-joined", actor: "system", kinds: BOTH, wallet: "none" },
  { from: "ACCEPTED", to: "NO_SHOW_TEACHER", trigger: "FR-4.6:teacher-absent", actor: "system", kinds: BOTH, wallet: "refund-learner" },
  { from: "ACCEPTED", to: "NO_SHOW_LEARNER", trigger: "FR-4.6:learner-absent", actor: "system", kinds: DIRECT, wallet: "release-to-teacher" },
  { from: "ACCEPTED", to: "NO_SHOW_LEARNER", trigger: "FR-4.6:learner-absent", actor: "system", kinds: BARTER, wallet: "barter-settle" },
  { from: "ACCEPTED", to: "NO_SHOW_BOTH", trigger: "FR-4.6:both-absent", actor: "system", kinds: BOTH, wallet: "refund-learner" },

  // ── Running ────────────────────────────────────────────────────
  { from: "IN_PROGRESS", to: "ENDED", trigger: "FR-6.1:complete-button", actor: "participant", kinds: BOTH, wallet: "none" },
  { from: "IN_PROGRESS", to: "ENDED", trigger: "FR-6.1:timer-expired", actor: "system", kinds: BOTH, wallet: "none" },
  { from: "IN_PROGRESS", to: "DISPUTED", trigger: "FR-6.1:low-completion", actor: "system", kinds: BOTH, wallet: "none" },

  // ── After the session: quiz / 48h window ───────────────────────
  { from: "ENDED", to: "QUIZ_PENDING", trigger: "FR-8.1:quiz-ready", actor: "system", kinds: BOTH, wallet: "none" },
  { from: "ENDED", to: "RELEASED", trigger: "FR-8.5:window-elapsed", actor: "system", kinds: DIRECT, wallet: "release-to-teacher" },
  { from: "ENDED", to: "BARTER_COMPLETED", trigger: "FR-8.5:window-elapsed", actor: "system", kinds: BARTER, wallet: "barter-hold" },
  { from: "ENDED", to: "DISPUTED", trigger: "FR-6.4:report", actor: "participant", kinds: BOTH, wallet: "none" },
  { from: "QUIZ_PENDING", to: "RELEASED", trigger: "FR-8.3:quiz-solved", actor: "learner", kinds: DIRECT, wallet: "release-to-teacher" },
  { from: "QUIZ_PENDING", to: "RELEASED", trigger: "FR-8.4:quiz-timeout", actor: "system", kinds: DIRECT, wallet: "release-to-teacher" },
  { from: "QUIZ_PENDING", to: "BARTER_COMPLETED", trigger: "FR-8.3:quiz-solved", actor: "learner", kinds: BARTER, wallet: "barter-hold" },
  { from: "QUIZ_PENDING", to: "BARTER_COMPLETED", trigger: "FR-8.4:quiz-timeout", actor: "system", kinds: BARTER, wallet: "barter-hold" },
  { from: "QUIZ_PENDING", to: "DISPUTED", trigger: "FR-6.4:report", actor: "participant", kinds: BOTH, wallet: "none" },

  // ── Admin decision ─────────────────────────────────────────────
  { from: "DISPUTED", to: "RESOLVED_REFUNDED", trigger: "FR-7.2:refund-learner", actor: "admin", kinds: BOTH, wallet: "refund-learner" },
  { from: "DISPUTED", to: "RESOLVED_RELEASED", trigger: "FR-7.2:pay-teacher", actor: "admin", kinds: DIRECT, wallet: "release-to-teacher" },
  { from: "DISPUTED", to: "BARTER_COMPLETED", trigger: "FR-7.2:pay-teacher", actor: "admin", kinds: BARTER, wallet: "barter-hold" },

  // ── Barter cycle outcome ───────────────────────────────────────
  { from: "BARTER_COMPLETED", to: "BARTER_SETTLED", trigger: "FR-3.4:cycle-completed", actor: "system", kinds: BARTER, wallet: "none" },
  { from: "BARTER_COMPLETED", to: "RELEASED", trigger: "FR-3.4:cycle-failed", actor: "system", kinds: BARTER, wallet: "barter-settle" },
];

export const TERMINAL_STATUSES: readonly SessionStatus[] = [
  "REJECTED",
  "AUTO_REJECTED",
  "CANCELLED",
  "NO_SHOW_TEACHER",
  "NO_SHOW_LEARNER",
  "NO_SHOW_BOTH",
  "RELEASED",
  "RESOLVED_REFUNDED",
  "RESOLVED_RELEASED",
  "BARTER_SETTLED",
];

/** Statuses that hold the participants' calendar (mirrors the DB exclusion constraints). */
export const BLOCKING_STATUSES: readonly SessionStatus[] = ["ACCEPTED", "IN_PROGRESS"];

export function findTransition(
  kind: SessionKind,
  from: SessionStatus,
  to: SessionStatus,
  trigger: string,
): Transition | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.to === to && t.trigger === trigger && t.kinds.includes(kind));
}

export function isTerminal(status: SessionStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
