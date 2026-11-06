import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "@/server/env";
import { runScheduledJobs } from "@/server/jobs/run-scheduled-jobs";

const AuthHeaderSchema = z.string().regex(/^Bearer \S+$/);

function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * NFR-3: entry point for an external scheduler (e.g. a hosting cron) to run one tick of the
 * time-based jobs. Disabled (404) unless CRON_SECRET is set; requires `Authorization: Bearer`.
 */
export async function POST(request: Request) {
  const secret = env().CRON_SECRET;
  if (!secret) {
    return new Response(null, { status: 404 });
  }

  const header = AuthHeaderSchema.safeParse(request.headers.get("authorization"));
  if (!header.success || !secretMatches(header.data.slice("Bearer ".length), secret)) {
    return Response.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const report = await runScheduledJobs();
  const ok = Object.keys(report.errors).length === 0;
  return Response.json(report, { status: ok ? 200 : 500 });
}
