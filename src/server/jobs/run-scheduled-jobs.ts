import type { PrismaClient } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { reconcileBarterCycles } from "@/server/services/barter/barter-service";
import { autoRejectExpiredRequests } from "@/server/services/sessions/booking-service";
import { processNoShowSessions } from "@/server/services/sessions/cancellation-service";
import { processDueSessionReleases } from "@/server/services/sessions/release-service";
import { expireTimedOutSessions } from "@/server/services/sessions/timer-service";

type JobName = "autoReject" | "noShow" | "timer" | "release" | "barterCycles";

export interface ScheduledJobsReport {
  startedAt: string;
  durationMs: number;
  results: Partial<Record<JobName, unknown>>;
  errors: Partial<Record<JobName, string>>;
}

/**
 * NFR-3: one tick of every time-based rule, in dependency order:
 * 1. FR-4.2 / Q-29 auto-reject requests nobody answered before the start time.
 * 2. FR-4.6 / Q-8 no-show detection at start + 15 min.
 * 3. FR-6.1 end sessions whose timer ran out (or refer them to the admin below 50%).
 * 4. FR-8.4 / FR-8.5 release hours 48h after the end unless disputed.
 * 5. FR-3.4 / Q-18 / Q-19 barter cycle expiry, failure, completion and settlement.
 *
 * Every job uses compare-and-set transitions and idempotent ledger keys, so a tick may overlap
 * another tick or a user action without double effects. A failing job never stops the others.
 */
export async function runScheduledJobs(
  client: PrismaClient = db,
  now: Date = new Date(),
): Promise<ScheduledJobsReport> {
  const started = Date.now();
  const report: ScheduledJobsReport = {
    startedAt: now.toISOString(),
    durationMs: 0,
    results: {},
    errors: {},
  };

  const jobs: [JobName, () => Promise<unknown>][] = [
    ["autoReject", () => autoRejectExpiredRequests(client, now)],
    ["noShow", () => processNoShowSessions(client, now)],
    ["timer", () => expireTimedOutSessions(client, now)],
    ["release", () => processDueSessionReleases(client, now)],
    ["barterCycles", () => reconcileBarterCycles(client, now)],
  ];

  for (const [name, job] of jobs) {
    try {
      report.results[name] = await job();
    } catch (error) {
      report.errors[name] = error instanceof Error ? error.message : String(error);
    }
  }

  report.durationMs = Date.now() - started;
  return report;
}
