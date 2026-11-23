# Design decisions

Newest at the bottom. Each entry: what was decided, why, and what it means for later parts.

## D1 — Keep Next.js 16 Cache Components on (Part 1)

`create-next-app@latest` (Next.js 16.4) enables `cacheComponents` and `partialPrefetching`. We keep
both: they are the framework default going forward and give a static shell with streamed holes.
Consequence: anything that reads the request (time, search params, cookies) must sit inside a
`<Suspense>` boundary. Pages are static shells; data views are client components wrapped in
`<Suspense>`.

## D2 — Data layer is plain async functions returning `Result<T>`

Every screen calls only functions in `src/data/*` (spec §9). In Part 1 they read in-memory
fixtures with 300–800 ms simulated latency. Screens call them from client components through a
small `useData` hook. In Part 2 the same functions become server actions (`"use server"`) or thin
fetch wrappers; the signatures and the serializable `Result<T>` stay the same, so screens don't
change.

## D3 — Simulated errors are opt-in

Random failures would make demos and screenshots flaky. Fixture functions fail only when forced:
`?__state=error` (dev only) or `NEXT_PUBLIC_FIXTURE_ERROR_RATE` (0–1, default 0). Specific error
codes (`CONFLICT`, `QUOTA_EXCEEDED`, `RATE_LIMITED`, `ILLEGAL_TRANSITION`, …) come from fixture
logic, so those states are reachable through normal use too.

## D4 — `?__state` preview is development-only

`?__state=loading|empty|error|fallback|quota|conflict` forces a state on the current screen.
The check is `process.env.NODE_ENV !== "production"`, which Next.js inlines at build time, so the
code path is removed from production bundles.

## D5 — Mock session in localStorage

No auth until Part 2. `getMe()` returns a user for the role stored under `cr:mockRole`
(default `guest` on first visit). Login/signup set `seeker`; logout sets `guest`; a dev-only
role switcher in the avatar menu sets `moderator`/`admin`. Admin items are hidden by role in the
UI; real enforcement is Part 2.

## D6 — Server time via a streamed seed

Spec §10 wants deadlines computed from server time. The root layout renders
`<ServerNowSeed/>` inside `<Suspense fallback={null}>`; it calls `connection()` and passes
`Date.now()` to a client component that stores the offset. `useServerNow()` returns
`Date.now() + offset`, so a wrong phone clock never changes a countdown. Until the seed arrives
the offset is 0.

## D7 — i18n: Bangla dictionary is the source of truth

`src/i18n/bn.ts` holds every UI string; `t("a.b.c", vars)` is typed against its keys and
interpolates `{name}` placeholders (numbers are converted to Bangla digits). `en.ts` is a partial
dictionary of the same shape; `t()` falls back to Bangla. Sample *data* (job titles,
organization names) lives in fixtures, not in the dictionary.

## D8 — Asia/Dhaka formatting without locale data

Bangla month names, digits and AM/PM-style day parts ("সকাল", "বিকাল", …) are produced by our own
`domain/bn` helpers on top of `date-fns-tz` (`toZonedTime`). `Intl` Bangla output differs between
browsers and Node versions, which would cause hydration mismatches.

## D9 — Organization avatars are initials

Per spec §2.1: no logos, no government emblem. Avatars show up to 3 initials from the English
short name (e.g. "DCK") on a color picked deterministically from the slug.

## D10 — Build order follows dependencies, commits follow spec sections

Screens need the data layer, which needs domain logic, so steps run in dependency order (see
PLAN.md). Each commit still maps to a spec section and leaves typecheck, lint and tests green.

## D11 — `cn` from clsx + tailwind-merge

The shadcn "nova" preset imports `cn` from the `cn` npm package. The spec lists clsx +
tailwind-merge, so `src/lib/utils.ts` implements `cn` with those and all UI components import it
from `@/lib/utils`.

## D12 — `@types/node` 22

Vitest 5 requires `@types/node` 22+ as a peer; the project runs on Node 22, so the types match
the runtime.

## D13 — Entity fields are camelCase

TypeScript entities in `src/types/*` use camelCase. Part 2's Drizzle schema maps them to
snake_case columns (`casing: "snake_case"`), so the names stay the contract. `Result.error`
keeps the spec's own field names (`message_bn`, `requestId`, `retryAfterSec`).

## D14 — Gated pages opt out of instant-navigation validation

Seeker and admin pages render behind a client-side role gate until Part 2 adds server auth, so
Next.js cannot prerender their segment. Each gated `page.tsx` (and the two group layouts) exports
`instant = false`. Part 2 can remove this once the session is read on the server.

## D15 — Components that read the URL stream inside Suspense

With Cache Components, `usePathname()`/`useSearchParams()` outside `<Suspense>` blocks
prerendering of dynamic routes. `AppHeader`, `BottomNav`, `RequireRole`, `AdminShell` and
`SessionExpiredDialog` wrap themselves in `<Suspense>`; dynamic pages read `params` with
`params.then(...)` inside `<Suspense>`.

## D16 — Fixture state is in memory per tab

Mutations change an in-memory store created on first use (`data/fixtures/db.ts`). A full reload
resets it; client-side navigation keeps it. Only the mock role and form drafts persist (localStorage).
Fixture dates are relative to "now" so "closing in 2 hours" stays true in every demo.

## D17 — Chart palette and accessibility

Charts follow the dataviz method: single-series charts use brand teal; multi-series charts use the
first three validated categorical slots (`#2a78d6`, `#eb6834`, `#1baf7a`). The status colors
(success/warning/danger) failed the CVD/normal-vision checks when stacked, so they are not used as
series colors. Each chart has a visually hidden data table; Recharts' own keyboard layer is off so
nothing focusable sits inside the `aria-hidden` SVG wrapper. Legend text uses ink, not series color.

## D18 — Sample-data notice and demo triggers

While `USING_SAMPLE_DATA` is true the footer says the data is a demo. Edge states are reachable on
purpose: `ratelimit@test.com` (rate limit), CV file names with `scan`/`locked`, `?__state=…`.
These live only in TEMP fixtures and disappear with Part 2.

## D19 — Input borders and list items

Input borders use `#7d8ba0` (≥ 3:1 on white, WCAG 1.4.11) instead of the lighter divider color.
`li { min-width: 0 }` globally, because grid items default to `min-width: auto` and long Bangla
titles otherwise widen the page at 360 px.

## D20 — E2E runs against `next dev` by default

The `?__state` preview is dev-only, so `npm run e2e` starts (or reuses) a dev server. Screenshots for
`docs/UI.md` are taken from a production server to avoid the dev overlay. Tests count only visible
`h1` elements because Cache Components keeps recently visited routes mounted but hidden.

# Part 2 decisions

## D21 — Status names follow the Part 2 spec

Tracker: `saved → preparing → applied → admit_card → exam_scheduled → written_passed → viva → selected`
(+ `rejected`, `withdrawn`). Circulars: `pending_review` and `closed` replace Part 1's `in_review`.
Education `class_8` replaces `below_ssc`. Types, i18n and UI were updated together. `preparing` is
optional (`saved → applied` is allowed). Admin "submit" on a rejected circular goes `rejected → draft →
pending_review`, two legal hops. Archive is only from `closed`.

## D22 — Reads through one Route Handler, writes through Server Actions

Next.js dispatches Server Actions one at a time per client, so screens that load several things at
once read through `POST /api/q/<name>` (a registry of validated read handlers). Mutations are Server
Actions (built-in origin check). Route Handlers check `Origin` themselves. Both return the Part 1
`Result<T>` / `{ error: { code, message_bn, fields?, requestId } }` shape with the right HTTP status.

## D23 — Idempotency key and mutation share one transaction

`runIdempotent` inserts the key row and runs the mutation in the same transaction: a concurrent
duplicate waits on the unique index then replays the stored response; a failure rolls back the key
too, so the same key can be retried. A key reused with a different payload is rejected. Supabase Auth
calls (sign-in etc.) are not replayed from the store — they change cookies, not our rows.

## D24 — Age reference date falls back to the publish date

Eligibility counts age on `age_reference_date`, else `published_on`. A Feb‑29 birthday turns a year
older on 1 March in non-leap years. Relaxations are stored as `{categoryBn, extraYears}` (the admin
form's shape) and matched to the user's special categories by keyword.

## D25 — Taxonomy ids are stable text ids

Divisions, districts, categories and tags use ids like `dis_khulna` / `cat_bank` (the Part 1 contract
and URLs) instead of integers. `eligible_district_ids` is `text[]`. The 11 spec categories replace
Part 1's list.

## D26 — `search_text` is maintained by the service, not a generated column

A generated column cannot read other tables (organization and post titles), so the circular service
(and the seed) build it with `buildCircularSearchText` on every save. Search = all tokens `ILIKE`
or `word_similarity > 0.55`; relevance = trigram similarity + title hits.

## D27 — "Only eligible" uses the eligibility function itself

The filter computes `computeEligibility` for open circulars and passes the ids to SQL, so it always
agrees with the panel (an integration test asserts the two sets are equal).

## D28 — Workflow runs and AI health stay simulated (TEMP) until Part 3

They live in `src/data/temp/` in the browser and never touch the database. The real review queue is
`pending_review` circulars. Billing uses a `subscriptions` table and quotas from `app_settings`; the
payment provider is Part 3, so checkout stays the clearly-labelled mock.

## D29 — Server-side gate for protected route groups

`proxy.ts` refreshes the session and redirects signed-out users to `/login?next=…`; the seeker and
admin layouts also check role/status on the server (`ServerRoleGate`, inside Suspense). Neither is the
security boundary — every service calls `authorize()` and checks ownership (someone else's row → 404).
The Part 1 dev role switcher is gone: roles only come from `profiles.role`.

## D30 — Integration tests run on PGlite locally, Postgres in CI

`tests/integration` migrates a fresh database (Supabase's `auth.users`, `auth.uid()` and roles are
stubbed) and seeds it. Locally that is PGlite (real Postgres in WASM, with pg_trgm/pgcrypto); CI uses
a Postgres service via `TEST_DATABASE_URL`. Re-auth and Supabase calls are not part of these tests.

## D31 — Seed data

Hand-written Part 1 circulars plus template-generated ones (40 / 71 posts), deterministic ids
(re-runs update in place), dates relative to seed time, `is_sample` on rows and "নমুনা তথ্য" in
descriptions. A few sample search-log rows are inserted only into an empty log so the admin
dashboard has content. Demo passwords go to the git-ignored `.seed-credentials.local.md`.

# Part 3 decisions

## D32 — One AI client with injectable dependencies

`createAiClient(deps)` takes the provider, store, clock, sleep and random. The app wires Gemini and Postgres (`src/server/ai/runtime.ts`); unit tests use a scripted provider, the memory store and fake timers. Per-attempt timeouts use an AbortController plus a timer (same effect as `AbortSignal.timeout`, and testable with fake timers).

## D33 — The breaker counts provider failures, not wrong answers

Timeouts, 429, 5xx, network errors and malformed output count toward the breaker. `invalid_semantics` does not, because the provider is healthy and the answer was wrong.

## D34 — AI work happens outside transactions

Resume tailoring prepares the AI changes first (`prepareTailor`), then writes inside the idempotent transaction. No rows are locked during a call that can take up to 25 s.

## D35 — The workflow engine takes time as a parameter

Claiming, backoff and leases use a `now` that is passed in, so lease expiry and retries are deterministic in tests. Seeded and test failures use `failAt` / `failAfterBatches` in the run input. A `failAt` run gets its own idempotency key, so the normal upload of the same file still works.

## D36 — pg_cron jobs are created by a function, not hard-coded

The deployed URL and `CRON_SECRET` are unknown when migrations run, so migration 0003 defines `schedule_chakri_cron(url, secret)` and `npm run db:cron` calls it.

## D37 — Mock checkout uses the real webhook path

The test checkout builds a signed event and passes it through `handlePaymentWebhook`: the same signature check and the same unique `provider_txn_id` a real provider would hit. The idempotency key becomes the transaction id, so a double click pays once.

## D38 — Optional integrations degrade instead of failing

Without `GEMINI_API_KEY` every AI feature uses its fallback (logged as `provider_error`). Without `RESEND_API_KEY` emails stay in the outbox. `CRON_SECRET` and `PAYMENT_WEBHOOK_SECRET` are required.

## D39 — CSP keeps 'unsafe-inline' for scripts

Next.js injects inline bootstrap scripts, and a nonce-based CSP would force every page to render dynamically. The CSP is enforced with `'unsafe-inline'` scripts, `frame-ancestors 'none'` and an allowlist for Supabase and Google.
