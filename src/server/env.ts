import { z } from "zod";

// Validated server environment. Parsed lazily so `next build` does not need a DB URL.
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_URL: z.url().default("http://localhost:3000"),
  /** Optional SMTP connection string. Empty → e-mails are printed to the console (dev). */
  SMTP_URL: z.string().optional().default(""),
  MAIL_FROM: z.string().default("ChronoSwap <no-reply@chronoswap.test>"),
  /** FR-4.3 / FR-8.1 — used from the AI phase onwards. */
  GEMINI_API_KEY: z.string().optional().default(""),
  GEMINI_MODEL: z.string().optional().default(""),
  /** NFR-3: seconds between in-process job ticks (src/instrumentation.ts). 0 disables them. */
  JOBS_INTERVAL_SECONDS: z.coerce.number().int().min(0).default(60),
  /** NFR-3: bearer token for POST /api/jobs/run (external cron). Empty disables the route. */
  CRON_SECRET: z.string().optional().default(""),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
    }
    cached = parsed.data;
  }
  return cached;
}
