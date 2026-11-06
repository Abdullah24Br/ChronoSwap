import { db } from "@/server/db";
import {
  processDueSessionReleases,
  processSessionRelease,
} from "@/server/services/sessions/release-service";

/**
 * NFR-3 / FR-8.4 / FR-8.5: Standalone scheduled job runner for session releases.
 */
export async function runReleaseJob(now: Date = new Date()) {
  return processDueSessionReleases(db, now);
}

export { processDueSessionReleases, processSessionRelease };

