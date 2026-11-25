# চাকরি রাডার — Chakri Radar

[![CI](https://github.com/Arina-Arni/chakri-ghor/actions/workflows/ci.yml/badge.svg)](https://github.com/Arina-Arni/chakri-ghor/actions/workflows/ci.yml)

**Hack the Vibe 2026 · World Problem Solver track** · Advanced challenges: **A06 External API & Fault Tolerance**, **A07 Automated Multi-Step Workflow**

## Problem and users

Bangladesh's job circulars, especially government ones, are scattered across hundreds of websites. Seekers find out late, can't easily tell if they are eligible (age counted on a specific date, district and education rules per post), and many lack an ATS-friendly English CV.

Chakri Radar is a Bangla-first web app for:

- **Job seekers:** mobile-first, many outside Dhaka.
- **Moderators and admins:** they ingest, verify and publish circulars.

## Features

- **Discovery:** full-text search (trigram + ILIKE, Bangla and English), facets, sort, keyset paging, zero-result suggestions, and **AI search** that turns a sentence into filters.
- **Eligibility engine:** exact age on the reference date (Feb-29 and quota relaxations included), education, subject, district, gender, experience and the application window.
- **Profile and resumes:** onboarding wizard with **AI CV parsing**, an English ATS resume with a deterministic score, **AI tailoring** behind a hallucination guard, and PDF download.
- **Tracker and reminders:** application state machine, deadline reminders (72 h / 24 h / 3 h) and exam reminders, in-app notifications plus email (Resend outbox).
- **Admin:** circular CRUD with review, the **ingestion workflow** (PDF, URL or text → AI extraction → review → publish → notify), AI health, fault injection, users and roles, audit log, feature flags and plans.
- **Plans:** Free and Premium quotas, a 7-day trial, mock payments with signed, idempotent webhooks.

Screens: [docs/UI.md](docs/UI.md) (mobile and desktop screenshots).

## Where to find A06 and A07

- **A06:** one AI client, [`src/lib/ai/client.ts`](src/lib/ai/client.ts). It handles timeouts, retries with jitter and Retry-After, a circuit breaker, JSON repair, semantic checks, cache, quotas and scoped fault injection. Calls are logged and shown on `/admin/ai-health`.
- **A07:** our own workflow engine, [`src/lib/workflow/engine.ts`](src/lib/workflow/engine.ts), with the ingestion steps in [`src/server/workflow/ingest.ts`](src/server/workflow/ingest.ts). It has leases, persisted outputs, resume, branching, a review gate and compensation. The timeline is on `/admin/workflows/[id]`.
- **Details and step-by-step reproduction:** [docs/CHALLENGES.md](docs/CHALLENGES.md). Rubric mapping: [docs/RUBRIC_MAP.md](docs/RUBRIC_MAP.md).

## Architecture

```mermaid
flowchart LR
  U[Browser / mobile] -->|HTTPS| N[Next.js on Vercel]
  N --> DB[(Supabase Postgres)]
  N --> AU[Supabase Auth]
  N --> ST[Supabase Storage]
  N -->|AI client: timeout · retry · breaker · validation · cache| G[Gemini API]
  N -->|email outbox| R[Resend]
  C[pg_cron] -->|CRON_SECRET| W[/api/cron/worker + /api/cron/scheduler/]
  W --> DB
```

How a request flows:

1. A screen calls `src/data/*`.
2. Reads go to `POST /api/q/<name>`; writes are Server Actions; files go to Route Handlers.
3. Each one calls `src/server/services/*`. Every service runs `authorize()`, then pure `src/domain/*` logic, then Drizzle.

## Data model (main tables)

```mermaid
erDiagram
  profiles ||--o{ applications : tracks
  profiles ||--o{ bookmarks : saves
  profiles ||--o{ resumes : owns
  profiles ||--o{ saved_searches : has
  profiles ||--o{ notifications : receives
  profiles ||--|| subscriptions : has
  organizations ||--o{ circulars : publishes
  circulars ||--o{ circular_posts : has
  circulars ||--o{ circular_revisions : versions
  circular_posts ||--o{ applications : "applied for"
  circular_posts ||--o{ bookmarks : ""
  applications ||--o{ application_events : log
  workflow_runs ||--o{ workflow_steps : has
  workflow_runs ||--o{ workflow_events : log
  workflow_runs }o--|| circulars : creates
  notifications ||--o| email_outbox : queues
  subscriptions ||--o{ payments : paid_by
```

There are also `ai_calls`, `ai_cache`, `circuit_breakers`, `fault_injections`, `usage_counters`, `plans`, `feature_flags`, `idempotency_keys`, `audit_logs` (append-only), `search_logs` and `rate_limits`. RLS is enabled on every table.

## Tech stack

Next.js 16 (App Router, TypeScript strict) · Tailwind CSS 4 + shadcn/ui · Supabase (Postgres, Auth, Storage, pg_cron) · Drizzle ORM · Google Gemini (`@google/genai`) · Resend + React Email · Vitest · PGlite · Playwright · Vercel.

## Local setup

1. Create a Supabase project.
   - Enable the Email (with confirmation) and Google providers.
   - Add `<APP_URL>/auth/callback` and `<APP_URL>/auth/confirm` as redirect URLs.
   - Enable the `pg_cron` and `pg_net` extensions.
2. Copy `.env.example` to `.env.local` and fill it in. Never commit it.
3. Run:

```bash
npm install
npm run db:migrate   # drizzle/*.sql over DIRECT_URL
npm run db:seed      # idempotent sample data, plans, demo workflow runs, one demo user per role
npm run dev
```

`db:seed` writes the demo logins to the git-ignored `.seed-credentials.local.md`. **Test accounts are provided privately to the judges.**

### Environment variables

| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project URL and anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | server only: storage, account deletion, seeding |
| `DATABASE_URL` / `DIRECT_URL` | pooler (app) / direct connection (migrations) |
| `APP_URL` | public URL (email links, cron, sitemap) |
| `IP_HASH_SALT` | salt for IP hashes; raw IPs are never stored |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | AI. Without a key every feature uses its fallback |
| `GEMINI_FALLBACK_MODELS` | optional, comma-separated; tried when `GEMINI_MODEL` is out of quota (default `gemini-3.5-flash-lite`) |
| `RESEND_API_KEY`, `EMAIL_FROM` | email. Without a key, emails stay queued |
| `CRON_SECRET` | auth for `/api/cron/*` (constant-time compare) |
| `FAULT_INJECTION_ALLOWED` | `true` lets admins inject AI faults into their own requests |
| `PAYMENT_PROVIDER`, `PAYMENT_WEBHOOK_SECRET` | `mock`; HMAC secret for webhooks |
| `INGEST_ALLOWED_HOSTS` | optional extra hosts for PDF-URL ingest |
| `NEXT_PUBLIC_SAMPLE_DATA_NOTICE` | `1` shows the "sample data" footer notice |

## Scripts

```bash
npm run typecheck && npm run lint
npm test                  # unit: domain, A06 client, guards, state machines
npm run test:integration  # real Postgres (PGlite locally, Postgres service in CI): authz, IDOR, A07, scheduler, payments
npm run check:fixtures    # nothing imports the removed Part 1 fixtures
npm run build && npm run check:secrets
npm run db:generate | db:migrate | db:seed | db:cron | db:local
npm run samples           # demo PDFs in /samples
npm run e2e               # Playwright; needs E2E_BASE_URL + E2E_* credentials of a seeded deployment
```

## Deployment

1. Link the GitHub repo to a Vercel project; `main` auto-deploys to production.
2. Set the env vars in Vercel.
3. Against the production database, run `npm run db:migrate` and `npm run db:seed`.
4. Run `npm run db:cron` once, with the production `APP_URL` and `CRON_SECRET`. It schedules `worker` (every minute) and `scheduler` (every 15 minutes) in pg_cron.
5. Check `/api/health` for the DB, breakers, outbox backlog and workflow backlog.

## Testing

| Layer | What it covers |
|---|---|
| Unit (Vitest) | eligibility boundaries, every state-machine pair, the search parser, matching, the A06 client (fake timers + scripted provider), the hallucination guard, ingest normalization, the subscription machine |
| Integration (real Postgres) | authorization and IDOR, role escalation, duplicates, idempotency replay, conflicts, rollback, exact dashboard numbers, the full A07 scenarios, scheduler idempotency, outbox retries, duplicate webhooks |
| E2E (Playwright) | routes plus axe on mobile and desktop, keyboard, Part 3 journeys (skipped without a seeded deployment) |
| CI | npm audit, typecheck, lint, unit, integration (Postgres service), build, a secret check on the client bundle, and E2E against a preview when configured |

## Limitations and future work

- No automatic scraping of government sites: circulars are uploaded, linked or pasted.
- Payments use a mock provider behind the `PaymentProvider` interface; bKash, SSLCommerz and carrier billing come at launch.
- Scanned PDFs need Gemini vision; there is no local OCR.
- Next: employer portal, PWA with push notifications, Sentry, an English toggle, dark mode, staging and backups.

Docs: [PLAN](docs/PLAN.md) · [DECISIONS](docs/DECISIONS.md) · [UI](docs/UI.md) · [CHALLENGES](docs/CHALLENGES.md) · [RUBRIC_MAP](docs/RUBRIC_MAP.md) · [TEST_SCENARIOS](docs/TEST_SCENARIOS.md) · [DEMO_SCRIPT](docs/DEMO_SCRIPT.md) · [SUBMISSION](docs/SUBMISSION.md)