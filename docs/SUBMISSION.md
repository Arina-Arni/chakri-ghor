# Hack the Vibe 2026 — submission

| Field | Value |
|---|---|
| **Project title** | চাকরি রাডার — Chakri Radar |
| **Selected track** | World Problem Solver |
| **Advanced challenges** | **A06 · External API & Fault Tolerance** and **A07 · Automated Multi-Step Workflow** (see `docs/CHALLENGES.md`) |
| **GitHub** | https://github.com/Arina-Arni/chakri-ghor |
| **Live URL** | _add the Vercel production URL after deployment_ |
| **YouTube demo** | _add after recording (`docs/DEMO_SCRIPT.md`)_ |
| **Test accounts** | Provided privately to the judges (seeker, moderator, admin) |

## Problem statement

Bangladesh's job circulars, especially government ones, are published separately on hundreds of ministry, directorate, district-office and bank websites. Job seekers, most of them on mobile and many outside Dhaka, find out late. They also struggle to tell whether they are eligible: age is counted on a specific date with quota relaxations, and posts have district and education rules. Many have no ATS-friendly English CV.

Chakri Radar collects circulars in one Bangla-first place. AI reads each circular through an automated, resumable ingestion workflow that a moderator checks before publishing. The app checks each seeker's eligibility exactly, tailors an ATS resume to the post, and tracks applications with deadline and exam reminders, so nobody misses a deadline.

## Users

- **Job seekers:** Bangla-first and mobile, searching, checking eligibility, building resumes and tracking applications.
- **Moderators and admins:** ingesting, reviewing, publishing and running the platform.
- **Employers:** planned after launch.

## Where to look

- `README.md`: features, architecture, ERD, setup, deployment and testing.
- `docs/RUBRIC_MAP.md`: every rubric line mapped to code and to a way to verify it.
- `docs/CHALLENGES.md`: A06 and A07 design, the failure scenarios handled, and reproduction steps for the live site.
- `docs/TEST_SCENARIOS.md`: numbered manual test scripts, including edge cases.
- `docs/DEMO_SCRIPT.md`: the video outline.
