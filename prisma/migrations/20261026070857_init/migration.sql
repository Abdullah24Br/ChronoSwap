-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SkillListKind" AS ENUM ('OFFERED', 'WANTED');

-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('DIRECT', 'BARTER');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'IN_PROGRESS', 'REJECTED', 'AUTO_REJECTED', 'CANCELLED', 'NO_SHOW_TEACHER', 'NO_SHOW_LEARNER', 'NO_SHOW_BOTH', 'ENDED', 'QUIZ_PENDING', 'DISPUTED', 'RELEASED', 'RESOLVED_REFUNDED', 'RESOLVED_RELEASED', 'BARTER_COMPLETED', 'BARTER_SETTLED');

-- CreateEnum
CREATE TYPE "SessionEndReason" AS ENUM ('COMPLETE_BUTTON', 'TIMER_EXPIRED');

-- CreateEnum
CREATE TYPE "AgendaSource" AS ENUM ('AI', 'FALLBACK');

-- CreateEnum
CREATE TYPE "AgendaPhase" AS ENUM ('THEORY', 'PRACTICE', 'REVIEW');

-- CreateEnum
CREATE TYPE "AttendanceEvent" AS ENUM ('JOIN', 'LEAVE');

-- CreateEnum
CREATE TYPE "DisputeSource" AS ENUM ('USER_REPORT', 'LOW_COMPLETION');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "DisputeResolution" AS ENUM ('REFUND_LEARNER', 'PAY_TEACHER');

-- CreateEnum
CREATE TYPE "AiJobStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "BarterCycleStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'COMPLETED', 'FAILED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BarterDecision" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('WELCOME_BONUS', 'SESSION_FREEZE', 'SESSION_REFUND', 'SESSION_RELEASE_DEBIT', 'SESSION_RELEASE_CREDIT', 'BARTER_SETTLEMENT_DEBIT', 'BARTER_SETTLEMENT_CREDIT', 'ADMIN_ADJUSTMENT');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" VARCHAR(80) NOT NULL,
    "bio" VARCHAR(1000),
    "avatar_url" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Damascus',
    "email_verified_at" TIMESTAMPTZ(3),
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "rating_sum" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent" VARCHAR(400),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "welcome_bonus_grants" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "user_id" UUID NOT NULL,
    "ledger_entry_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "welcome_bonus_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_categories" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "name_ar" VARCHAR(80) NOT NULL,
    "name_en" VARCHAR(80),
    "position" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "skill_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "name_ar" VARCHAR(80) NOT NULL,
    "name_en" VARCHAR(80),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_skills" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "kind" "SkillListKind" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_slots" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "start_minute" SMALLINT NOT NULL,
    "end_minute" SMALLINT NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "available_minutes" INTEGER NOT NULL DEFAULT 0,
    "frozen_minutes" INTEGER NOT NULL DEFAULT 0,
    "debt_minutes" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "wallet_version" INTEGER NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "available_delta" INTEGER NOT NULL DEFAULT 0,
    "frozen_delta" INTEGER NOT NULL DEFAULT 0,
    "debt_delta" INTEGER NOT NULL DEFAULT 0,
    "available_after" INTEGER NOT NULL,
    "frozen_after" INTEGER NOT NULL,
    "debt_after" INTEGER NOT NULL,
    "operation_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(200),
    "session_id" UUID,
    "barter_cycle_id" UUID,
    "dispute_id" UUID,
    "actor_id" UUID,
    "memo" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "original_minutes" INTEGER NOT NULL,
    "remaining_minutes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMPTZ(3),

    CONSTRAINT "debts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "kind" "SessionKind" NOT NULL DEFAULT 'DIRECT',
    "status" "SessionStatus" NOT NULL DEFAULT 'PENDING',
    "learner_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "duration_minutes" SMALLINT NOT NULL,
    "goal" VARCHAR(500) NOT NULL,
    "escrow_minutes" SMALLINT NOT NULL,
    "meeting_url" VARCHAR(500),
    "responded_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_id" UUID,
    "cancel_reason" VARCHAR(500),
    "teacher_first_joined_at" TIMESTAMPTZ(3),
    "learner_first_joined_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "end_reason" "SessionEndReason",
    "ended_by_id" UUID,
    "completion_percent" SMALLINT,
    "release_due_at" TIMESTAMPTZ(3),
    "settled_at" TIMESTAMPTZ(3),
    "agenda_source" "AgendaSource",
    "agenda_generated_at" TIMESTAMPTZ(3),
    "barter_cycle_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_events" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "from_status" "SessionStatus",
    "to_status" "SessionStatus" NOT NULL,
    "trigger" VARCHAR(80) NOT NULL,
    "actor_id" UUID,
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_logs" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event" "AttendanceEvent" NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda_tasks" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "details" VARCHAR(1000),
    "phase" "AgendaPhase",
    "planned_minutes" SMALLINT NOT NULL,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "done_at" TIMESTAMPTZ(3),
    "done_by_id" UUID,

    CONSTRAINT "agenda_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_workspaces" (
    "session_id" UUID NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL DEFAULT '',
    "code_language" VARCHAR(32) NOT NULL DEFAULT 'plaintext',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "session_workspaces_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "rater_id" UUID NOT NULL,
    "ratee_id" UUID NOT NULL,
    "stars" SMALLINT NOT NULL,
    "review" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "source" "DisputeSource" NOT NULL,
    "opened_by_id" UUID,
    "reason" VARCHAR(2000),
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" "DisputeResolution",
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "admin_note" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_summaries" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "status" "AiJobStatus" NOT NULL DEFAULT 'PENDING',
    "summary" TEXT,
    "key_points" JSONB,
    "exercises" JSONB,
    "model" VARCHAR(64),
    "error_message" VARCHAR(1000),
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "ai_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quizzes" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_questions" (
    "id" UUID NOT NULL,
    "quiz_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "prompt" VARCHAR(1000) NOT NULL,
    "options" JSONB NOT NULL,
    "correct_option" SMALLINT NOT NULL,
    "explanation" VARCHAR(1000),

    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" UUID NOT NULL,
    "quiz_id" UUID NOT NULL,
    "learner_id" UUID NOT NULL,
    "answers" JSONB NOT NULL,
    "correct_count" SMALLINT NOT NULL,
    "total_count" SMALLINT NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barter_cycles" (
    "id" UUID NOT NULL,
    "status" "BarterCycleStatus" NOT NULL DEFAULT 'PROPOSED',
    "duration_minutes" SMALLINT NOT NULL,
    "initiator_id" UUID,
    "proposed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respond_by_at" TIMESTAMPTZ(3) NOT NULL,
    "activated_at" TIMESTAMPTZ(3),
    "schedule_by_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "barter_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barter_participants" (
    "id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "teaches_skill_id" UUID NOT NULL,
    "decision" "BarterDecision" NOT NULL DEFAULT 'PENDING',
    "decided_at" TIMESTAMPTZ(3),

    CONSTRAINT "barter_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "welcome_bonus_grants_email_key" ON "welcome_bonus_grants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "welcome_bonus_grants_user_id_key" ON "welcome_bonus_grants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "welcome_bonus_grants_ledger_entry_id_key" ON "welcome_bonus_grants"("ledger_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "skill_categories_slug_key" ON "skill_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "skill_categories_name_ar_key" ON "skill_categories"("name_ar");

-- CreateIndex
CREATE UNIQUE INDEX "skills_slug_key" ON "skills"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "skills_category_id_name_ar_key" ON "skills"("category_id", "name_ar");

-- CreateIndex
CREATE INDEX "user_skills_skill_id_kind_idx" ON "user_skills"("skill_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "user_skills_user_id_skill_id_kind_key" ON "user_skills"("user_id", "skill_id", "kind");

-- CreateIndex
CREATE INDEX "availability_slots_user_id_weekday_idx" ON "availability_slots"("user_id", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_idempotency_key_key" ON "ledger_entries"("idempotency_key");

-- CreateIndex
CREATE INDEX "ledger_entries_session_id_idx" ON "ledger_entries"("session_id");

-- CreateIndex
CREATE INDEX "ledger_entries_operation_id_idx" ON "ledger_entries"("operation_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_wallet_id_wallet_version_key" ON "ledger_entries"("wallet_id", "wallet_version");

-- CreateIndex
CREATE INDEX "debts_user_id_settled_at_idx" ON "debts"("user_id", "settled_at");

-- CreateIndex
CREATE UNIQUE INDEX "debts_user_id_session_id_key" ON "debts"("user_id", "session_id");

-- CreateIndex
CREATE INDEX "sessions_teacher_id_status_idx" ON "sessions"("teacher_id", "status");

-- CreateIndex
CREATE INDEX "sessions_learner_id_status_idx" ON "sessions"("learner_id", "status");

-- CreateIndex
CREATE INDEX "sessions_status_start_at_idx" ON "sessions"("status", "start_at");

-- CreateIndex
CREATE INDEX "sessions_status_release_due_at_idx" ON "sessions"("status", "release_due_at");

-- CreateIndex
CREATE INDEX "sessions_teacher_id_learner_id_start_at_idx" ON "sessions"("teacher_id", "learner_id", "start_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_barter_cycle_id_teacher_id_key" ON "sessions"("barter_cycle_id", "teacher_id");

-- CreateIndex
CREATE INDEX "session_events_session_id_created_at_idx" ON "session_events"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "attendance_logs_session_id_user_id_at_idx" ON "attendance_logs"("session_id", "user_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "agenda_tasks_session_id_position_key" ON "agenda_tasks"("session_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_session_id_key" ON "ratings"("session_id");

-- CreateIndex
CREATE INDEX "ratings_ratee_id_idx" ON "ratings"("ratee_id");

-- CreateIndex
CREATE UNIQUE INDEX "disputes_session_id_key" ON "disputes"("session_id");

-- CreateIndex
CREATE INDEX "disputes_status_created_at_idx" ON "disputes"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_summaries_session_id_key" ON "ai_summaries"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "quizzes_session_id_key" ON "quizzes"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_questions_quiz_id_position_key" ON "quiz_questions"("quiz_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_attempts_quiz_id_key" ON "quiz_attempts"("quiz_id");

-- CreateIndex
CREATE INDEX "barter_cycles_status_idx" ON "barter_cycles"("status");

-- CreateIndex
CREATE INDEX "barter_participants_user_id_decision_idx" ON "barter_participants"("user_id", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "barter_participants_cycle_id_user_id_key" ON "barter_participants"("cycle_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "barter_participants_cycle_id_position_key" ON "barter_participants"("cycle_id", "position");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "welcome_bonus_grants" ADD CONSTRAINT "welcome_bonus_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "welcome_bonus_grants" ADD CONSTRAINT "welcome_bonus_grants_ledger_entry_id_fkey" FOREIGN KEY ("ledger_entry_id") REFERENCES "ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "skill_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_barter_cycle_id_fkey" FOREIGN KEY ("barter_cycle_id") REFERENCES "barter_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "disputes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debts" ADD CONSTRAINT "debts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debts" ADD CONSTRAINT "debts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_cancelled_by_id_fkey" FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_ended_by_id_fkey" FOREIGN KEY ("ended_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_barter_cycle_id_fkey" FOREIGN KEY ("barter_cycle_id") REFERENCES "barter_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_tasks" ADD CONSTRAINT "agenda_tasks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_tasks" ADD CONSTRAINT "agenda_tasks_done_by_id_fkey" FOREIGN KEY ("done_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_workspaces" ADD CONSTRAINT "session_workspaces_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_workspaces" ADD CONSTRAINT "session_workspaces_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_rater_id_fkey" FOREIGN KEY ("rater_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_ratee_id_fkey" FOREIGN KEY ("ratee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_opened_by_id_fkey" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barter_cycles" ADD CONSTRAINT "barter_cycles_initiator_id_fkey" FOREIGN KEY ("initiator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barter_participants" ADD CONSTRAINT "barter_participants_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "barter_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barter_participants" ADD CONSTRAINT "barter_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "barter_participants" ADD CONSTRAINT "barter_participants_teaches_skill_id_fkey" FOREIGN KEY ("teaches_skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═════════════════════════════════════════════════════════════════════
-- Hand-written constraints (Prisma cannot express these in schema.prisma).
-- Prisma's diffing ignores CHECK / EXCLUDE constraints and triggers, so
-- future `prisma migrate dev` runs keep them. Never remove this section.
-- ═════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Generic guard for append-only tables (NFR-2).
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Default SQLSTATE P0001 so the message reaches the application unchanged.
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP;
END
$$;

-- users -------------------------------------------------------------------
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_normalised" CHECK ("email" = lower(btrim("email"))),
  ADD CONSTRAINT "users_rating_aggregate_valid" CHECK ("rating_count" >= 0 AND "rating_sum" BETWEEN "rating_count" AND "rating_count" * 5);

-- FR-1.2 welcome bonus: once per e-mail (unique index above) and normalised.
ALTER TABLE "welcome_bonus_grants"
  ADD CONSTRAINT "welcome_bonus_email_normalised" CHECK ("email" = lower(btrim("email")));

-- FR-1.4 availability ------------------------------------------------------
ALTER TABLE "availability_slots"
  ADD CONSTRAINT "availability_weekday_range" CHECK ("weekday" BETWEEN 0 AND 6),
  ADD CONSTRAINT "availability_minutes_range" CHECK ("start_minute" >= 0 AND "start_minute" < "end_minute" AND "end_minute" <= 1440);

-- Wallet (FR-2.x, NFR-2): balances can never go negative --------------------
ALTER TABLE "wallets"
  ADD CONSTRAINT "wallets_available_non_negative" CHECK ("available_minutes" >= 0),
  ADD CONSTRAINT "wallets_frozen_non_negative" CHECK ("frozen_minutes" >= 0),
  ADD CONSTRAINT "wallets_debt_non_negative" CHECK ("debt_minutes" >= 0),
  ADD CONSTRAINT "wallets_version_non_negative" CHECK ("version" >= 0);

-- Ledger (NFR-2): consistent, non-negative, append-only ---------------------
ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_after_non_negative" CHECK ("available_after" >= 0 AND "frozen_after" >= 0 AND "debt_after" >= 0),
  ADD CONSTRAINT "ledger_has_effect" CHECK ("available_delta" <> 0 OR "frozen_delta" <> 0 OR "debt_delta" <> 0),
  ADD CONSTRAINT "ledger_wallet_version_positive" CHECK ("wallet_version" >= 1);

-- FR-1.2 belt and braces: one welcome bonus entry per wallet.
CREATE UNIQUE INDEX "ledger_one_welcome_bonus_per_wallet"
  ON "ledger_entries" ("wallet_id") WHERE "type" = 'WELCOME_BONUS';

CREATE TRIGGER "ledger_entries_append_only"
  BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER "ledger_entries_no_truncate"
  BEFORE TRUNCATE ON "ledger_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- FR-3.4 debt ---------------------------------------------------------------
ALTER TABLE "debts"
  ADD CONSTRAINT "debts_original_positive" CHECK ("original_minutes" > 0),
  ADD CONSTRAINT "debts_remaining_range" CHECK ("remaining_minutes" BETWEEN 0 AND "original_minutes"),
  ADD CONSTRAINT "debts_settled_iff_zero" CHECK (("remaining_minutes" = 0) = ("settled_at" IS NOT NULL));

-- Sessions (FR-4.x) ---------------------------------------------------------
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_distinct_participants" CHECK ("learner_id" <> "teacher_id"),
  ADD CONSTRAINT "sessions_duration_allowed" CHECK ("duration_minutes" IN (30, 60, 90, 120)),
  ADD CONSTRAINT "sessions_end_matches_duration" CHECK ("end_at" - "start_at" = "duration_minutes" * INTERVAL '1 minute'),
  ADD CONSTRAINT "sessions_escrow_matches_kind" CHECK (
    ("kind" = 'DIRECT' AND "escrow_minutes" = "duration_minutes") OR
    ("kind" = 'BARTER' AND "escrow_minutes" = 0 AND "barter_cycle_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "sessions_completion_range" CHECK ("completion_percent" IS NULL OR "completion_percent" BETWEEN 0 AND 100);

-- No double booking: a user can't be in two accepted / running sessions at
-- overlapping times, as teacher or as learner.
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_teacher_no_overlap" EXCLUDE USING gist (
    "teacher_id" WITH =, tstzrange("start_at", "end_at", '[)') WITH &&
  ) WHERE ("status" IN ('ACCEPTED', 'IN_PROGRESS')),
  ADD CONSTRAINT "sessions_learner_no_overlap" EXCLUDE USING gist (
    "learner_id" WITH =, tstzrange("start_at", "end_at", '[)') WITH &&
  ) WHERE ("status" IN ('ACCEPTED', 'IN_PROGRESS'));

-- Audit trails are append-only.
CREATE TRIGGER "session_events_append_only"
  BEFORE UPDATE OR DELETE ON "session_events"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER "attendance_logs_append_only"
  BEFORE UPDATE OR DELETE ON "attendance_logs"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Agenda (FR-5.4) -------------------------------------------------------------
ALTER TABLE "agenda_tasks"
  ADD CONSTRAINT "agenda_planned_positive" CHECK ("planned_minutes" > 0),
  ADD CONSTRAINT "agenda_done_consistent" CHECK ("is_done" = ("done_at" IS NOT NULL));

-- Ratings (FR-6.2) ------------------------------------------------------------
ALTER TABLE "ratings"
  ADD CONSTRAINT "ratings_stars_range" CHECK ("stars" BETWEEN 1 AND 5),
  ADD CONSTRAINT "ratings_not_self" CHECK ("rater_id" <> "ratee_id");

-- Disputes (FR-7.2) -------------------------------------------------------------
ALTER TABLE "disputes"
  ADD CONSTRAINT "disputes_resolution_consistent" CHECK (
    ("status" = 'RESOLVED') = ("resolution" IS NOT NULL AND "resolved_at" IS NOT NULL)
  );

-- Quiz (FR-8.3) -------------------------------------------------------------------
ALTER TABLE "quiz_questions"
  ADD CONSTRAINT "quiz_questions_correct_option_non_negative" CHECK ("correct_option" >= 0);
ALTER TABLE "quiz_attempts"
  ADD CONSTRAINT "quiz_attempts_score_range" CHECK ("total_count" > 0 AND "correct_count" BETWEEN 0 AND "total_count");

-- Barter (FR-3.3 / FR-3.4) ------------------------------------------------------
ALTER TABLE "barter_cycles"
  ADD CONSTRAINT "barter_cycles_duration_allowed" CHECK ("duration_minutes" IN (30, 60, 90, 120));
ALTER TABLE "barter_participants"
  ADD CONSTRAINT "barter_participants_position_range" CHECK ("position" BETWEEN 0 AND 2);
