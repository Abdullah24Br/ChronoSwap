// NFR-3: runs the time-based jobs inside the Node.js server process (`npm run dev` / `npm start`).
// For serverless hosting, set JOBS_INTERVAL_SECONDS=0 and call POST /api/jobs/run from a cron.

declare global {
  var __chronoswapJobsTimer: ReturnType<typeof setInterval> | undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (globalThis.__chronoswapJobsTimer) return; // survives dev hot reloads

  const { env } = await import("@/server/env");
  const seconds = env().JOBS_INTERVAL_SECONDS;
  if (seconds <= 0) return;

  const { runScheduledJobs } = await import("@/server/jobs/run-scheduled-jobs");

  let running = false;
  const tick = async () => {
    if (running) return; // never overlap two ticks in one process
    running = true;
    try {
      const report = await runScheduledJobs();
      const failed = Object.entries(report.errors);
      if (failed.length > 0) {
        console.error("[jobs] some scheduled jobs failed:", Object.fromEntries(failed));
      }
    } catch (error) {
      console.error("[jobs] tick failed:", error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, seconds * 1000);
  timer.unref();
  globalThis.__chronoswapJobsTimer = timer;
  void tick();
}
