# Chakri Ghor — চাকরি রাডার (Chakri Radar)

A project for Hack the Vibe 2026.

A Bangla-first web app that collects Bangladesh job circulars in one place, checks each seeker's
eligibility, builds a tailored ATS resume and tracks applications so nobody misses a deadline.

## Status

Part 1 (UI/UX & frontend) — every screen runs on TEMP fixture data in `src/data/fixtures/`.
Part 2 replaces the data layer with Supabase; Part 3 adds AI, the workflow engine and deployment.

## Develop

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck
npm run lint
npm test             # unit tests (Vitest)
npx playwright install chromium   # once
npm run e2e          # smoke + accessibility (Playwright + axe)
```

Dev-only helpers:

- `?__state=loading|empty|error|fallback|quota|conflict` forces a UI state on the current screen.
- The avatar menu has a role switcher (guest / seeker / moderator / admin).

Docs: [docs/PLAN.md](docs/PLAN.md), [docs/DECISIONS.md](docs/DECISIONS.md), [docs/UI.md](docs/UI.md).
