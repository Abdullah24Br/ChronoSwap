# ChronoSwap · بنك الوقت للمهارات

منصة عربية لتبادل المهارات بنظام «بنك الوقت» والمقايضة الذكية: علّم ساعة، وتعلّم ساعة.

Graduation project. Requirements: [docs/SRS.md](docs/SRS.md) · Open questions: [docs/QUESTIONS.md](docs/QUESTIONS.md) · Session lifecycle: [docs/SESSION_STATE_MACHINE.md](docs/SESSION_STATE_MACHINE.md) · Project rules: [CLAUDE.md](CLAUDE.md)

## Status

All 36 functional requirements of SRS v2 have an implementation, and the five non-functional ones are covered in code (NFR-1 to NFR-5). HTTPS (NFR-1) depends on where the app is deployed.

| Area | Pages | Requirements |
|---|---|---|
| Accounts & skills | `/register`, `/login`, `/verify-email`, `/profile` | FR-1.1 – FR-1.4 |
| Wallet & escrow | `/wallet` | FR-2.1 – FR-2.4, NFR-2 |
| Search & barter | `/explore`, `/barter` | FR-3.1 – FR-3.4 |
| Booking & AI agenda | `/sessions/new`, `/sessions` | FR-4.1 – FR-4.6 |
| Session room | `/sessions/[id]` | FR-5.1 – FR-5.4, FR-6.1, FR-6.2, FR-6.4 |
| Learning archive | `/archive` | FR-5.5, FR-8.2 |
| AI summary & quiz | inside the room | FR-8.1 – FR-8.6, NFR-5 |
| Admin | `/admin`, `/admin/skills`, `/admin/disputes` | FR-7.1 – FR-7.3 |
| Scheduled jobs | runs inside the server | NFR-3 |

Ambiguous rules follow the defaults in [docs/QUESTIONS.md](docs/QUESTIONS.md) (`Q-…` numbers in code comments) until the team confirms them.

## Requirements

- **Node.js 20.9+** (developed on 24) and **Git**.
- **No database install needed.** PostgreSQL 18 runs embedded from `node_modules` (`npm run db:start`).
  - Want a hosted DB instead (e.g. for deployment)? Create a free project on [neon.tech](https://neon.tech) and put its **direct** connection string in `DATABASE_URL`.
- Optional: a **Gemini API key** (`GEMINI_API_KEY`, from [aistudio.google.com](https://aistudio.google.com)). Without it the app uses the fallback agenda (FR-4.4) and skips the AI summary and quiz (FR-8.5).

## First run (Windows / PowerShell, macOS, Linux)

```bash
copy .env.example .env      # PowerShell / cmd   (macOS/Linux: cp .env.example .env)
npm install                 # also generates the Prisma client

# Terminal 1: database (keep it open; stop it with Ctrl+C, not by closing the window)
npm run db:start

# Terminal 2
npx prisma migrate deploy   # create tables + constraints
npm run db:seed             # admin + 15 skills + 3 demo users
npm run dev                 # http://localhost:3000  ·  design system: /design
```

Port **5433** is the database, not a web page. The site is on **http://localhost:3000**.

Seeded accounts (password for demo users: `Demo#ChronoSwap2026`):

| Account | E-mail |
|---|---|
| Admin | `admin@chronoswap.test` / `Admin#ChronoSwap2026` |
| Demo users (form a barter triangle) | `sara@chronoswap.test`, `omar@chronoswap.test`, `layla@chronoswap.test` |

To try the 3-way barter: log in as Sara, open `/barter` and propose the suggested cycle, then accept it as Omar and as Layla. The cycle becomes active and each of them can book their own session.

E-mails (verification links) are printed in the `npm run dev` terminal unless `SMTP_URL` is set.

## Scheduled jobs (NFR-3)

The server runs one job tick every `JOBS_INTERVAL_SECONDS` (default 60) from [`src/instrumentation.ts`](src/instrumentation.ts):

1. auto-reject requests nobody answered before the start time (FR-4.2),
2. no-show detection 15 minutes after the start (FR-4.6),
3. end sessions whose timer ran out, or refer them to the admin below 50% (FR-6.1),
4. release the hours 48 hours after the end unless disputed (FR-8.4, FR-8.5),
5. barter cycle upkeep: expire unanswered proposals, fail or complete cycles, settle failed ones (FR-3.4).

Every job is idempotent and safe to run in parallel. On serverless hosting, set `JOBS_INTERVAL_SECONDS=0`, set `CRON_SECRET`, and call `POST /api/jobs/run` with `Authorization: Bearer <CRON_SECRET>` from a cron.

## Scripts

| Script | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run db:start` | Embedded PostgreSQL on port 5433 (data in `.data/`) |
| `npm run db:migrate` | New migration from schema changes + regenerate client |
| `npm run db:deploy` | Apply existing migrations |
| `npm run db:seed` | Idempotent seed |
| `npm run db:studio` | Prisma Studio (browse data) |
| `npm run typecheck` · `lint` · `test` · `test:db` | Checks (`test:db` uses a separate `chronoswap_test` DB) |
| `npm run check` | All four checks |

If `npm run build` fails with a Turbopack error about `globals.css`, delete the `.next` folder and build again.

## Layout

```
prisma/                 schema.prisma, migrations (incl. hand-written constraints), seed.ts
src/app/                routes (see the Status table) + /api/jobs/run
src/components/         ui/ design system, shell/, and one folder per feature
src/lib/                shared: SRS rules (rules.ts), time formatting & zones (time.ts), status labels
src/server/actions/     server actions (zod-validated with defineAction, auth checked on the server)
src/server/services/    business logic per area: wallet, sessions, barter, ai, admin, search, …
src/server/domain/      session state machine
src/server/jobs/        runScheduledJobs() (NFR-3)
src/instrumentation.ts  in-process job timer
tests/db/               integration tests against real PostgreSQL
docs/                   SRS, questions, state machine
```
