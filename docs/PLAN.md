# Part 1 plan — UI/UX & frontend

Goal: the complete Chakri Radar frontend (every route in spec §3.2, every UI state in §2.6),
running on typed data-layer functions backed by TEMP fixtures, so Part 2 only swaps the
implementations in `src/data/*`.

## Build order

The spec's sections depend on each other (screens need the data layer, the data layer needs the
domain logic), so work happens in dependency order. Each step ends with `npm run typecheck`,
`npm run lint` and the unit tests passing, then a Conventional Commit named after the spec section.

| # | Step | Spec | Output |
|---|------|------|--------|
| 1 | Setup | §1 | Next.js 16 + TS strict, Tailwind 4, shadcn/ui (Radix), Prettier, Vitest, Playwright, folder layout |
| 2 | Pure logic + tests | §10 | `domain/bn`, `domain/status`, `domain/countdown`, `domain/ats` with unit tests |
| 3 | Types, schemas, i18n | §9, §7 | `types/*`, `schemas/*` (zod), `i18n/bn.ts`, `i18n/en.ts`, `t()` |
| 4 | Data layer + fixtures | §9 | `data/*` functions returning `Result<T>`, fixtures covering every state, `?__state` preview |
| 5 | Design system | §2 | tokens, fonts, every component in §2.5 with all states |
| 6 | Information architecture | §3 | route groups, headers, sidebar, bottom nav, footer, every route reachable |
| 7 | Public & seeker screens | §4 | landing, jobs, detail, eligibility, org, auth, onboarding, profile, resumes, tracker, lists, dashboard, settings, billing |
| 8 | Admin screens | §5 | overview, circulars, review, ingest/workflows, orgs, users, audit, AI health, settings |
| 9 | Global/system screens | §6 | 404, error, offline, session expired, conflict, legal, loading skeletons |
| 10 | Forms & a11y pass | §7, §8 | error summaries, focus management, drafts, unsaved guard, keyboard walkthrough |
| 11 | Acceptance | §11 | Playwright smoke + axe, screenshots, `docs/UI.md` |

## How screens get data

```
page.tsx (server, static shell + <Suspense>)
  └─ <XxxScreen/> (client)
       └─ useData(() => listCirculars(filters))   ← src/data/* only
             ├─ loading → Skeleton
             ├─ ok + empty → EmptyState
             ├─ ok → content
             └─ error → ErrorState (message_bn + retry + requestId)
```

`useData` also reads `?__state=loading|empty|error|fallback|quota|conflict` in development.

## Mock session

There is no auth until Part 2. `getMe()` reads a mock role (`guest | seeker | moderator | admin`)
from localStorage. Logging in on `/login` sets `seeker`; the avatar menu has a dev-only role
switcher so guest and admin views can be reviewed.

## Out of scope for Part 1

Database, real auth, AI calls, email, payments, the workflow engine, dark mode (P2).
