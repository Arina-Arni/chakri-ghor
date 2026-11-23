# Chakri Ghor — চাকরি রাডার (Chakri Radar)

A project for Hack the Vibe 2026.

A Bangla-first web app that collects Bangladesh job circulars in one place, checks each seeker's
eligibility, builds a tailored ATS resume and tracks applications so nobody misses a deadline.

## Status

- **Part 1 (UI/UX)** — done.
- **Part 2 (backend & core logic)** — done: Supabase Auth, Postgres via Drizzle, every screen on real
  data. AI features run on their non-AI path (rule-based search parser, regex CV extraction,
  template resume tailoring). The ingest/workflow and AI-health screens are still simulated until Part 3.
- **Part 3** — AI with fault tolerance (A06), ingestion workflow (A07), email, payments, deployment docs.

## Setup

1. Create a Supabase project. In **Authentication → Providers** enable Email (with confirmation)
   and Google. Add `<APP_URL>/auth/callback` and `<APP_URL>/auth/confirm` to the redirect URLs.
2. Copy `.env.example` to `.env.local` and fill in the values (never commit it, never paste keys in chat).
3. Install and prepare the database:

```bash
npm install
npm run db:migrate   # applies drizzle/*.sql over DIRECT_URL
npm run db:seed      # idempotent sample data + one demo user per role
npm run dev          # http://localhost:3000
```

`db:seed` creates the private `circular-pdfs` bucket and writes the demo logins to
`.seed-credentials.local.md` (git-ignored).

### Environment variables

| Name | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | storage signing, account deletion, seeding |
| `DATABASE_URL` | server | pooler connection (transaction mode, `prepare: false`) |
| `DIRECT_URL` | scripts | direct connection for migrations and seeding |
| `APP_URL` | server | public URL, used in auth email links |
| `IP_HASH_SALT` | server | salt for IP hashes (raw IPs are never stored) |
| `NEXT_PUBLIC_SAMPLE_DATA_NOTICE` | optional | `1` shows the "sample data" footer notice |
| `CSP_ENFORCE` | optional | `1` enforces the CSP (default is report-only) |

The app fails fast with a list of missing variables (`src/env.ts`).

## Scripts

```bash
npm run typecheck
npm run lint
npm test                 # unit tests (domain logic, schemas)
npm run test:integration # services against real Postgres (PGlite locally, TEST_DATABASE_URL in CI)
npm run check:fixtures   # fails if anything imports the removed Part 1 fixtures
npm run db:generate      # new migration from src/server/db/schema.ts
npm run db:migrate
npm run db:seed
npm run db:local         # throwaway seeded Postgres on :5433 (no Supabase; public pages only)
npm run e2e              # Playwright (needs a running app with a seeded backend)
```

Dev-only helper: `?__state=loading|empty|error|conflict` forces a UI state on the current screen.

## Architecture (Part 2)

```
screen → src/data/*  ─ reads ──▶ POST /api/q/<name> ─┐
                     └ writes ─▶ Server Actions ──────┤→ src/server/services/* → authorize() → src/domain/* + Drizzle
                     └ files ──▶ /api/cv, /api/resumes/[id]/pdf ┘
```

Docs: [docs/PLAN.md](docs/PLAN.md), [docs/DECISIONS.md](docs/DECISIONS.md), [docs/UI.md](docs/UI.md).
