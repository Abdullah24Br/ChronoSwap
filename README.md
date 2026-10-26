# ChronoSwap · بنك الوقت للمهارات

منصة عربية لتبادل المهارات بنظام «بنك الوقت» والمقايضة الذكية: علّم ساعة، وتعلّم ساعة.

Graduation project. Requirements: [docs/SRS.md](docs/SRS.md) · Open questions: [docs/QUESTIONS.md](docs/QUESTIONS.md) · Session lifecycle: [docs/SESSION_STATE_MACHINE.md](docs/SESSION_STATE_MACHINE.md) · Project rules: [CLAUDE.md](CLAUDE.md)

## Status

**Phase 0 (foundation) is done:** full database schema for every phase, wallet ledger core, auth primitives, design system, and app shell. No features yet.

## Requirements

- **Node.js 20.9+** (developed on 24) and **Git**.
- **No database install needed.** PostgreSQL 18 runs embedded from `node_modules` (`npm run db:start`).
  - Want a hosted DB instead (e.g. for deployment)? Create a free project on [neon.tech](https://neon.tech) and put its **direct** connection string in `DATABASE_URL`.

## First run (Windows / PowerShell, macOS, Linux)

```bash
copy .env.example .env      # PowerShell / cmd   (macOS/Linux: cp .env.example .env)
npm install                 # also generates the Prisma client

# Terminal 1: database (keep it open)
npm run db:start

# Terminal 2
npx prisma migrate deploy   # create tables + constraints
npm run db:seed             # admin + 15 skills + 3 demo users
npm run dev                 # http://localhost:3000  ·  design system: /design
```

Seeded accounts (password for demo users: `Demo#ChronoSwap2026`):

| Account | E-mail |
|---|---|
| Admin | `admin@chronoswap.test` / `Admin#ChronoSwap2026` |
| Demo users (form a barter triangle) | `sara@chronoswap.test`, `omar@chronoswap.test`, `layla@chronoswap.test` |

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

## Layout

```
prisma/                 schema.prisma (all phases), migrations (incl. hand-written constraints), seed.ts
src/app/                routes: / (landing), /design (component showcase)
src/components/ui/      Button, Input, Card, Badge, Modal, Toast, Skeleton, EmptyState, TimeAmount, …
src/components/shell/   RTL navbar, mobile bottom nav, theme toggle, logo
src/lib/                shared: SRS rules (rules.ts), minute formatting & time zones (time.ts)
src/server/             db client, env, errors, defineAction (zod), auth, mail
src/server/domain/      session state machine
src/server/services/    business logic (wallet ledger so far)
tests/db/               integration tests against real PostgreSQL
docs/                   SRS, questions, state machine
```
