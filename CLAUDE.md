@AGENTS.md

# ChronoSwap: permanent project rules

Arabic (RTL) skill-exchange platform on a time-bank model with smart barter. A university graduation project.
Requirements: [docs/SRS.md](docs/SRS.md) (source PDF: docs/SRS.pdf). Assumed answers to ambiguities: [docs/QUESTIONS.md](docs/QUESTIONS.md).
Session lifecycle: [docs/SESSION_STATE_MACHINE.md](docs/SESSION_STATE_MACHINE.md).

These rules apply to every phase. If a request conflicts with them, raise it before deviating.

## Stack

- Next.js 16 App Router (Turbopack, **`cacheComponents: true`**), React 19, TypeScript strict, Tailwind CSS v4 (CSS-first tokens in `src/app/globals.css`).
- PostgreSQL + Prisma 7 (`prisma.config.ts`, `prisma-client` generator → `src/generated/prisma`, `@prisma/adapter-pg`). Import from `@/generated/prisma/client` (server) or `@/generated/prisma/enums` (types and enums, safe anywhere).
- zod v4, bcryptjs, nodemailer (console transport in dev), Vitest.
- Next.js 16 differs from older versions: read `node_modules/next/dist/docs/` before using an API you're unsure of.

## Money = time. Integer minutes only

- **Never** store or compute balances as floats or hours. Everything is **integer minutes** (0.5h = 30). Convert only for display.
- All numeric SRS rules live in `src/lib/rules.ts`. Don't hard-code 120, 48h, 12h, 15 min, 50%, 3h and the like elsewhere.
- Render balances only with `<TimeAmount minutes={…} />` (format: Latin digits + «ساعة», e.g. `1.5 ساعة`).

## Wallet & ledger (NFR-2)

- Every wallet change (freeze, release, refund, settlement, debt, bonus, adjustment) goes through `postLedgerEntries()` in `src/server/services/wallet/ledger.ts`, inside **one** transaction from `withWalletTransaction()`. It locks the wallet rows (`SELECT … FOR UPDATE`, ordered by id), writes the ledger rows, and updates the cached balances.
- Never `update` wallet balances directly. Never update or delete `ledger_entries`: a DB trigger rejects it. Corrections are new `ADMIN_ADJUSTMENT` entries.
- Give every operation a job or retry could repeat an `idempotencyKey` (e.g. `release:<sessionId>:credit`).
- Session status changes and their wallet effects happen in the **same** transaction.

## Session status changes

- Only transitions listed in `src/server/domain/session-state-machine.ts` are legal. If you add one, update `docs/SESSION_STATE_MACHINE.md` too (a test enforces this).
- Change status with compare-and-set (`updateMany({ where: { id, status: from } })`, expect `count === 1`) and append a `SessionEvent` with the transition's `trigger`.

## Authorization & validation (NFR-1)

- Check authorization **on the server** in every server action, route handler, and data loader. Example: only the session's teacher and learner can read or write its room. The UI hiding a button is not authorization.
- Build every server action with `defineAction(zodSchema, handler)` (`src/server/action.ts`). Validate every route handler body or query with zod as well.
- Business-rule failures throw `DomainError` subclasses (`src/server/errors.ts`) with Arabic user-facing messages.
- With Cache Components, anything reading `cookies()` / `getCurrentUser()` must render inside `<Suspense>` (or run in actions or route handlers). See `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`.
- Admin accounts are created only by `prisma/seed.ts`. Registration always creates `USER`.

## Time

- Store instants in UTC (`timestamptz`). Display them in the viewer's IANA zone (`users.timezone`) with `formatDateTime()` from `src/lib/time.ts`.
- Weekly availability is stored as local wall-clock time plus zone (DST-safe; see Q-3).

## Architecture

- Business logic lives in `src/server/services/<area>/*` (pure domain rules in `src/server/domain/*`). UI components and pages call services and never contain business rules or Prisma queries for mutations.
- `src/lib/*` holds code shared by client and server (no Node or DB imports). `src/components/ui/*` holds the design-system primitives.
- AI (Gemini, FR-4.3 / FR-8.1) is called only from `src/server/services/ai/*`, with a 30s timeout and the fallback paths (FR-4.4 / FR-8.5). Send only educational content, never names or e-mails (FR-8.6).
- Time-based jobs (NFR-3: auto-reject, no-show, 48h release) must be idempotent and safe to run concurrently.

## Traceability

- Reference the requirement ID in a comment wherever one is implemented, e.g. `// FR-2.2: freeze the session duration on request`.
- When a default from `docs/QUESTIONS.md` is implemented, reference it too (`// Q-12`).

## UI (NFR-4)

- Arabic, RTL: `<html lang="ar" dir="rtl">`. Responsive for desktop and mobile (mobile bottom nav, 16px gutters, no horizontal scroll).
- Use **logical** Tailwind utilities only: `ms-/me-/ps-/pe-`, `start-/end-`, `text-start/end`, `border-s/e`, `rounded-s/e`. Never `ml-/mr-/pl-/pr-/left-/right-/text-left/right`. Directional icons (arrows, chevrons) must point the RTL way.
- Use design tokens only (`bg-canvas`, `bg-surface`, `bg-raised`, `text-fg`, `text-muted`, `border-line`, `amber`/`cyan` + `-ink`/`-soft`, `success`, `danger`). No raw hex values or default Tailwind palette colours in components. Amber = giving / available; cyan = receiving / frozen.
- Dark-first with a light mode (`data-theme` on `<html>`). Check both modes.
- Never letter-space Arabic text. Wrap LTR fragments (numbers with signs, code, e-mails) in `dir="ltr"` / `<bdi>`.
- Review new UI on `/design` (component showcase) at 390px and desktop widths.

## Workflow: after each phase

1. `npm run typecheck` · `npm run lint` · `npm test` · `npm run test:db` (or `npm run check` for all four; the DB tests need `npm run db:start` running).
2. `npm run build` must pass.
3. Commit to git with a message that lists the FR IDs covered.

## Commands

| Command | What it does |
|---|---|
| `npm run db:start` | Local PostgreSQL on :5433 (embedded, no install; keep the terminal open) |
| `npm run db:migrate` | Create and apply a migration from schema changes, then regenerate the client |
| `npm run db:seed` | Seed admin, skills, and demo users (idempotent) |
| `npm run dev` | Dev server on http://localhost:3000 |
| `npm run check` | typecheck + lint + unit tests + DB tests |

Hand-written SQL (CHECK / EXCLUDE constraints, append-only triggers) sits at the end of `prisma/migrations/*_init/migration.sql`. For new constraints, use `prisma migrate dev --create-only`, append the SQL, then apply. Prisma's diffing ignores them, so they persist.
