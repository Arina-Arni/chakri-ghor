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
