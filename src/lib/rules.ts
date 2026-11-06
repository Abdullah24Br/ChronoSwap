// Every numeric rule from the SRS in one place (safe to import on client and server).
// All time amounts are INTEGER MINUTES.

/** FR-1.1: email verification link valid for 24 hours. */
export const EMAIL_VERIFICATION_TTL_HOURS = 24;
export const EMAIL_VERIFICATION_TTL_MS = EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000;

/** FR-1.2 */
export const WELCOME_BONUS_MINUTES = 120;

/** FR-4.1 */
export const SESSION_DURATIONS = [30, 60, 90, 120] as const;
export type SessionDuration = (typeof SESSION_DURATIONS)[number];

/** FR-4.6: cancelling an accepted session later than this counts as absence. */
export const CANCELLATION_CUTOFF_MINUTES = 12 * 60;

/** FR-4.6: grace period after start before a participant is marked absent. */
export const NO_SHOW_GRACE_MINUTES = 15;

/** FR-6.1: share of agenda tasks that must be checked (percent). */
export const COMPLETION_THRESHOLD_PERCENT = 50;

/** FR-6.3: max session minutes between the same two users per week. */
export const WEEKLY_PAIR_CAP_MINUTES = 3 * 60;

/** FR-6.4 / FR-8.4 / FR-8.5: dispute + quiz window after a session ends. */
export const RELEASE_WINDOW_MINUTES = 48 * 60;

/** FR-4.4: fallback agenda split (percent of the session). */
export const FALLBACK_AGENDA_SPLIT = { THEORY: 25, PRACTICE: 50, REVIEW: 25 } as const;

/** FR-8.1 */
export const QUIZ_QUESTION_COUNT = 3;

/** FR-6.2 */
export const RATING_MIN_STARS = 1;
export const RATING_MAX_STARS = 5;

/** FR-3.4 / Q-18: the other two participants must answer a cycle proposal within 72 hours. */
export const BARTER_PROPOSAL_TTL_MINUTES = 72 * 60;

/** FR-3.4 / Q-18: all three cycle sessions must be booked within 14 days of activation. */
export const BARTER_SCHEDULE_WINDOW_MINUTES = 14 * 24 * 60;

/** NFR-5: give up on the AI and use the fallback after this long. */
export const AI_TIMEOUT_MS = 30_000;
