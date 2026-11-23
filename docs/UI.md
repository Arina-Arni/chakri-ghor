# UI screens (Part 1)

Every route from spec section 3.2, captured from a production build at 360 px (mobile) and 1280 px (desktop). All data is TEMP sample data from `src/data/fixtures/`.

Regenerate: `npm run build && npx next start -p 3200`, then `SCREENSHOTS=1 E2E_BASE_URL=http://localhost:3200 npm run screenshots`.

## How to see every UI state

| State | How |
|---|---|
| Loading / empty / error | `?__state=loading`, `?__state=empty`, `?__state=error` on any screen (dev only) |
| AI fallback / quota | `/jobs?q=...&ai=1&__state=fallback` or `&__state=quota`; the 4th guest AI search also hits the quota; resume tailoring on `/resumes/res_dev` |
| Edit conflict | `?__state=conflict` then save on `/profile`, `/settings`, `/applications`, `/resumes/[id]`, `/admin/circulars` |
| Offline | turn the network off (browser devtools) - global banner |
| Session expired | avatar menu > dev item, or any request that returns `UNAUTHENTICATED` |
| Roles | avatar menu > role switcher (dev); logging in as `admin@...` or `mod@...` also works |
| CV upload outcomes | file name containing `scan` (unreadable), `locked` (password-protected); wrong type / > 5 MB are rejected on the client |
| Rate limit | log in or sign up with `ratelimit@test.com` |
| Illegal tracker move | e.g. move an "আগ্রহী" card straight to "ভাইভা" |
| Workflow states | `/admin/workflows/run_1043` (failed mid-way), `run_1044` (waiting review), `run_1045` (running, auto-refresh), `run_1042` (succeeded); new runs from `/admin/ingest` with the fail-at option |

## Screens

### `/`

Landing: hero with AI search, live stats, closing today, categories, divisions, how it works, features, CTA

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/landing-mobile.jpg" width="220" alt="/ on mobile"> | <img src="screenshots/landing-desktop.jpg" width="560" alt="/ on desktop"> |

### `/jobs`

Job list: facet filters (sidebar / bottom sheet), AI search chips, sort, load more, zero-result suggestions, save search

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/jobs-mobile.jpg" width="220" alt="/jobs on mobile"> | <img src="screenshots/jobs-desktop.jpg" width="560" alt="/jobs on desktop"> |

### `/jobs/[slug]`

Job detail: key facts, multi-post picker, eligibility panel, banners, sticky apply bar, report dialog

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/job-detail-mobile.jpg" width="220" alt="/jobs/[slug] on mobile"> | <img src="screenshots/job-detail-desktop.jpg" width="560" alt="/jobs/[slug] on desktop"> |

### `/organizations`

Organization directory with search

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/organizations-mobile.jpg" width="220" alt="/organizations on mobile"> | <img src="screenshots/organizations-desktop.jpg" width="560" alt="/organizations on desktop"> |

### `/organizations/[slug]`

Organization page: header, open and past circulars

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/organization-mobile.jpg" width="220" alt="/organizations/[slug] on mobile"> | <img src="screenshots/organization-desktop.jpg" width="560" alt="/organizations/[slug] on desktop"> |

### `/pricing`

Free vs Premium plans and FAQ

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/pricing-mobile.jpg" width="220" alt="/pricing on mobile"> | <img src="screenshots/pricing-desktop.jpg" width="560" alt="/pricing on desktop"> |

### `/about`

About (prose layout)

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/about-mobile.jpg" width="220" alt="/about on mobile"> | <img src="screenshots/about-desktop.jpg" width="560" alt="/about on desktop"> |

### `/privacy`

Privacy policy

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/privacy-mobile.jpg" width="220" alt="/privacy on mobile"> | <img src="screenshots/privacy-desktop.jpg" width="560" alt="/privacy on desktop"> |

### `/terms`

Terms

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/terms-mobile.jpg" width="220" alt="/terms on mobile"> | <img src="screenshots/terms-desktop.jpg" width="560" alt="/terms on desktop"> |

### `/login`

Login with error summary, rate-limit state, Google button

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/login-mobile.jpg" width="220" alt="/login on mobile"> | <img src="screenshots/login-desktop.jpg" width="560" alt="/login on desktop"> |

### `/signup`

Signup with strength meter and terms checkbox

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/signup-mobile.jpg" width="220" alt="/signup on mobile"> | <img src="screenshots/signup-desktop.jpg" width="560" alt="/signup on desktop"> |

### `/forgot-password`

Forgot password

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/forgot-password-mobile.jpg" width="220" alt="/forgot-password on mobile"> | <img src="screenshots/forgot-password-desktop.jpg" width="560" alt="/forgot-password on desktop"> |

### `/reset-password`

Reset password

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/reset-password-mobile.jpg" width="220" alt="/reset-password on mobile"> | <img src="screenshots/reset-password-desktop.jpg" width="560" alt="/reset-password on desktop"> |

### `/check-email`

Check your email

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/check-email-mobile.jpg" width="220" alt="/check-email on mobile"> | <img src="screenshots/check-email-desktop.jpg" width="560" alt="/check-email on desktop"> |

### `/onboarding`

4-step onboarding wizard with CV upload states and drafts

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/onboarding-mobile.jpg" width="220" alt="/onboarding on mobile"> | <img src="screenshots/onboarding-desktop.jpg" width="560" alt="/onboarding on desktop"> |

### `/dashboard`

Seeker dashboard: completeness, stats, closing this week, exams, chart, recommendations

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/dashboard-mobile.jpg" width="220" alt="/dashboard on mobile"> | <img src="screenshots/dashboard-desktop.jpg" width="560" alt="/dashboard on desktop"> |

### `/profile`

Profile sections as editable cards with completeness

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/profile-mobile.jpg" width="220" alt="/profile on mobile"> | <img src="screenshots/profile-desktop.jpg" width="560" alt="/profile on desktop"> |

### `/resumes`

Resume studio list with ATS scores

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/resumes-mobile.jpg" width="220" alt="/resumes on mobile"> | <img src="screenshots/resumes-desktop.jpg" width="560" alt="/resumes on desktop"> |

### `/resumes/[id]`

Resume editor: inline-editable A4 preview, live ATS score, AI changes (DiffList), history

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/resume-editor-mobile.jpg" width="220" alt="/resumes/[id] on mobile"> | <img src="screenshots/resume-editor-desktop.jpg" width="560" alt="/resumes/[id] on desktop"> |

### `/applications`

Application tracker: board / list, status select, detail drawer

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/applications-mobile.jpg" width="220" alt="/applications on mobile"> | <img src="screenshots/applications-desktop.jpg" width="560" alt="/applications on desktop"> |

### `/bookmarks`

Saved jobs (includes a closed job)

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/bookmarks-mobile.jpg" width="220" alt="/bookmarks on mobile"> | <img src="screenshots/bookmarks-desktop.jpg" width="560" alt="/bookmarks on desktop"> |

### `/alerts`

Saved searches with alert switches

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/alerts-mobile.jpg" width="220" alt="/alerts on mobile"> | <img src="screenshots/alerts-desktop.jpg" width="560" alt="/alerts on desktop"> |

### `/notifications`

Notifications grouped by day

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/notifications-mobile.jpg" width="220" alt="/notifications on mobile"> | <img src="screenshots/notifications-desktop.jpg" width="560" alt="/notifications on desktop"> |

### `/settings`

Settings tabs: account, notifications, security, data (danger zone)

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/settings-mobile.jpg" width="220" alt="/settings on mobile"> | <img src="screenshots/settings-desktop.jpg" width="560" alt="/settings on desktop"> |

### `/billing`

Plan, status and quota meters

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/billing-mobile.jpg" width="220" alt="/billing on mobile"> | <img src="screenshots/billing-desktop.jpg" width="560" alt="/billing on desktop"> |

### `/billing/checkout/mock`

Clearly labelled test checkout

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/checkout-mock-mobile.jpg" width="220" alt="/billing/checkout/mock on mobile"> | <img src="screenshots/checkout-mock-desktop.jpg" width="560" alt="/billing/checkout/mock on desktop"> |

### `/admin`

Admin overview: stat tiles, charts, top and zero-result searches

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/admin-mobile.jpg" width="220" alt="/admin on mobile"> | <img src="screenshots/admin-desktop.jpg" width="560" alt="/admin on desktop"> |

### `/admin/circulars`

Circulars DataTable with status-aware row actions

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/admin-circulars-mobile.jpg" width="220" alt="/admin/circulars on mobile"> | <img src="screenshots/admin-circulars-desktop.jpg" width="560" alt="/admin/circulars on desktop"> |

### `/admin/circulars/new`

Circular form: organization, notice, posts repeater, tags; sticky footer

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/admin-circular-new-mobile.jpg" width="220" alt="/admin/circulars/new on mobile"> | <img src="screenshots/admin-circular-new-desktop.jpg" width="560" alt="/admin/circulars/new on desktop"> |

### `/admin/circulars/[id]/edit`

Circular form in edit mode

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/admin-circular-edit-mobile.jpg" width="220" alt="/admin/circulars/[id]/edit on mobile"> | <img src="screenshots/admin-circular-edit-desktop.jpg" width="560" alt="/admin/circulars/[id]/edit on desktop"> |

### `/admin/review`

Review queue with confidence badges

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/admin-review-mobile.jpg" width="220" alt="/admin/review on mobile"> | <img src="screenshots/admin-review-desktop.jpg" width="560" alt="/admin/review on desktop"> |

### `/admin/review/[id]`

Review split view: PDF + extracted fields, low-confidence highlights

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/admin-review-item-mobile.jpg" width="220" alt="/admin/review/[id] on mobile"> | <img src="screenshots/admin-review-item-desktop.jpg" width="560" alt="/admin/review/[id] on desktop"> |

### `/admin/ingest`

Ingest (PDF / text / URL), fault-injection option, runs table

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/admin-ingest-mobile.jpg" width="220" alt="/admin/ingest on mobile"> | <img src="screenshots/admin-ingest-desktop.jpg" width="560" alt="/admin/ingest on desktop"> |

### `/admin/workflows/[runId]`

Workflow run timeline with retry / run from / skip / fix actions

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/admin-workflow-mobile.jpg" width="220" alt="/admin/workflows/[runId] on mobile"> | <img src="screenshots/admin-workflow-desktop.jpg" width="560" alt="/admin/workflows/[runId] on desktop"> |

### `/admin/organizations`

Organizations table, form dialog, verify toggle

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/admin-organizations-mobile.jpg" width="220" alt="/admin/organizations on mobile"> | <img src="screenshots/admin-organizations-desktop.jpg" width="560" alt="/admin/organizations on desktop"> |

### `/admin/users`

Users table, role-change dialog with admin password, suspend

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/admin-users-mobile.jpg" width="220" alt="/admin/users on mobile"> | <img src="screenshots/admin-users-desktop.jpg" width="560" alt="/admin/users on desktop"> |

### `/admin/audit`

Audit log with filters and before/after JSON diff

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/admin-audit-mobile.jpg" width="220" alt="/admin/audit on mobile"> | <img src="screenshots/admin-audit-desktop.jpg" width="560" alt="/admin/audit on desktop"> |

### `/admin/ai-health`

AI health per feature, circuit breakers, failures, fault injection

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/admin-ai-health-mobile.jpg" width="220" alt="/admin/ai-health on mobile"> | <img src="screenshots/admin-ai-health-desktop.jpg" width="560" alt="/admin/ai-health on desktop"> |

### `/admin/settings`

Feature flags and plan quotas

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/admin-settings-mobile.jpg" width="220" alt="/admin/settings on mobile"> | <img src="screenshots/admin-settings-desktop.jpg" width="560" alt="/admin/settings on desktop"> |

### `/(any unknown URL)`

404 with search box and home link

| Mobile (360) | Desktop (1280) |
|---|---|
| <img src="screenshots/not-found-mobile.jpg" width="220" alt="/(any unknown URL) on mobile"> | <img src="screenshots/not-found-desktop.jpg" width="560" alt="/(any unknown URL) on desktop"> |

