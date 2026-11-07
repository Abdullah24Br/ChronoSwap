-- DropIndex
DROP INDEX "sessions_barter_cycle_id_teacher_id_key";

-- CreateIndex
CREATE INDEX "sessions_barter_cycle_id_teacher_id_idx" ON "sessions"("barter_cycle_id", "teacher_id");

-- Hand-written (Prisma cannot express partial indexes; its diffing ignores this one).
-- FR-3.4 / Q-18: one live session per teacher (= per leg) in a barter cycle. A rejected,
-- auto-rejected or cancelled request no longer blocks the leg, so it can be re-booked
-- before the cycle's 14-day scheduling deadline.
CREATE UNIQUE INDEX "sessions_one_live_barter_leg"
  ON "sessions" ("barter_cycle_id", "teacher_id")
  WHERE "barter_cycle_id" IS NOT NULL
    AND "status" NOT IN ('REJECTED', 'AUTO_REJECTED', 'CANCELLED');
