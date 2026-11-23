# Advanced challenges — A06 and A07

Chakri Radar declares two advanced challenges:

- **A06 · External API & Fault Tolerance**: Gemini behind one fault-tolerant client.
- **A07 · Automated Multi-Step Workflow**: our own resumable workflow engine for ingesting circulars.

## Evidence separation (rule 05, no double counting)

| | A06 is shown through | A07 is shown through |
|---|---|---|
| Features | AI search, CV parsing, resume tailoring (seeker-facing) | Circular ingestion from upload to notification (admin-facing) |
| Mechanisms | timeouts, retries, breaker, schema repair, semantic validation, cache, quotas, fault injection | steps, persisted outputs, resume, leases, idempotency, conditional gate, compensation |
| Main demo failure | an **AI** fault the admin injects (timeout, 500, bad JSON…) | a **non-AI** step failure (`notify_matches` or `create_draft` via `failAt`) |

The A07 demo never depends on an AI failure, and the A06 demo never needs the workflow.

---

## A06 — External API & Fault Tolerance

### Design

Every AI call goes through `callAI` in [`src/lib/ai/client.ts`](../src/lib/ai/client.ts). No component or service imports the SDK. Gemini sits behind the `AiProvider` interface ([`src/server/ai/gemini.ts`](../src/server/ai/gemini.ts)). State shared across serverless instances (breakers, cache, call log, fault injections, the global budget) lives in Postgres ([`src/server/ai/store.ts`](../src/server/ai/store.ts)).

A call goes through these stages in order:

1. **Fault injection.** This applies only to the admin who turned it on, and only when `FAULT_INJECTION_ALLOWED=true`.
2. **Circuit breaker.** One breaker per feature, kept in `circuit_breakers`. It opens after 5 failures within 60 s. While open, the call goes straight to the fallback, and a stale cache entry is served if one exists. After 30 s it moves to `half_open` and lets exactly one probe through; a row lock guarantees only one caller gets the probe.
3. **Fresh cache.** Lives in `ai_cache`. The key is the sha256 of feature + normalized input + `PROMPT_VERSION`.
4. **Global provider budget.** Requests per minute are counted in `usage_counters`. Over the budget, the call degrades to the fallback.
5. **Attempts.**
   - Each attempt has its own timeout and the abort signal is passed down.
   - The total budget includes retries, and a retry that cannot finish before the deadline is never started.
   - Backoff is exponential with full jitter (base 300 ms, cap 4 s), and `Retry-After` is honored.
   - Only timeouts, network errors, 429 and 5xx are retried. 400/401/403 are never retried.
6. **Structured output.** The request asks for JSON matching a schema. The answer goes through code-fence stripping and first-object extraction, then a Zod shape check. A failed check gets **one repair attempt** that includes the validation error; if that fails too, the fallback is used.
7. **Semantic validation.**
   - Unknown district, division and category ids are dropped, and absurd salaries, ages and dates are removed.
   - The resume **hallucination guard** ([`src/domain/ai-guard`](../src/domain/ai-guard/index.ts)) rejects any rewrite that introduces an employer, job title, date, degree, institution, number or certification that is not in the resume.
   - If the critical fields are invalid, the call returns the fallback and is logged as `invalid_semantics`.
8. **Logging.** Every call writes an `ai_calls` row: outcome, attempts, latency, tokens, error and request id.

| Feature | Budget | Retries | Fallback |
|---|---|---|---|
| AI search (`parseSearchQuery`) | 4 s total | 1 | rule-based parser (Part 2) |
| CV parse | 20 s | 2 | regex extraction + manual form |
| Resume tailoring | 25 s | 1 | template tailoring; the ATS score is always deterministic |
| Circular extraction (A07 step) | 45 s | step-level (3) | heuristic draft that goes to `needs_review` |
| Tagging (A07 step) | 15 s | 2 | keyword dictionary |
| Email (Resend) | 10 s | outbox, 5 attempts | in-app notification only; the outbox row becomes `dead` |

**Quotas.** Quotas are per plan, and guests are limited per salted IP hash. They are counted in `usage_counters` with one atomic upsert, and the check runs **before** the AI call. Over quota returns 429 with a Bangla message, the remaining count and the reset time ([`src/server/quota.ts`](../src/server/quota.ts)).

**Security of external calls.** CVs, circulars and queries are untrusted. They are wrapped in `<<< >>>` delimiters with an instruction to treat them only as data. AI output never decides authorization or triggers actions; the AI only produces filters and drafts. PDF-URL ingest is SSRF-safe ([`fetch-pdf.ts`](../src/server/workflow/fetch-pdf.ts)): allowlisted hosts, HTTPS only, every redirect re-checked, private IPs blocked, a 15 MB cap while streaming, and content-type plus magic-byte checks.

### Failure scenarios handled

| Failure | What happens | Test |
|---|---|---|
| Gemini hangs | timeout inside the budget, then fallback | `tests/unit/ai-client.test.ts` "timeout → fallback within the total budget" |
| 429 with Retry-After | waits exactly Retry-After, then retries; no retry if it can't fit | "429 … honored", "does not start a retry that cannot finish" |
| 5xx | retried with backoff, then fallback | "5xx is retried, then falls back" |
| 400 | not retried | "400 is never retried" |
| Garbage / fenced / truncated JSON | one repair attempt | "malformed JSON gets one repair attempt" |
| Wrong schema twice | fallback (`malformed`) | "wrong schema twice → fallback" |
| Hallucinated district | dropped, logged | "drops a hallucinated district"; integration "AI search … drops a hallucinated district" |
| Invented employer in a resume rewrite | change rejected (`invalid_semantics`) | `tests/unit/ai-guard.test.ts` |
| Repeated failures | breaker opens, short-circuits, half-open probe closes it | "breaker opens after 5 failed calls…" |
| Outage with a known answer | stale cache served while the breaker is open | "serves a stale cache hit…" |
| Over quota | 429 without calling the AI | integration "quota exceeded → 429 without calling the AI" |
| No API key | every feature runs its fallback | "without a provider…" |

### Reproducing the judges' test on the live site

1. Log in with the **admin test account** (shared privately). The server runs with `FAULT_INJECTION_ALLOWED=true`.
2. Open `/admin/ai-health`. Under fault injection, pick a feature (for example *AI সার্চ*) and a mode (for example *টাইমআউট* or *ভাঙা JSON*), then enable it. It affects **only this admin's requests** and expires after 15 minutes. The action is written to the audit log.
3. Go to `/jobs`, switch on AI mode and search `খুলনায় সরকারি চাকরি`. The results still appear, the chips come from the rule-based parser, and the UI shows a plain-Bangla notice that the simple search was used. With *টাইমআউট*, this happens within the 4-second budget.
4. Back on `/admin/ai-health`, the failure appears in "last 50 failures" with its outcome, attempts and latency, and the success and fallback percentages update. After 5 failed calls the breaker turns **open**. About 30 s later it allows one probe and closes again once the fault is turned off.
5. Repeat with *সিভি পড়া* on `/profile` (CV upload) and *রিজিউমে সাজানো* on a resume (Tailor). Each falls back: regex CV extraction, and template tailoring with a deterministic ATS score.
6. Log in as the seeker in another browser while the fault is on. Their AI search still uses the AI, because injection is scoped to the admin.

### Limitations

- The global budget is per minute and not tuned to Gemini's exact quota, so it is set conservatively (`AI_GLOBAL_RPM`, default 60).
- The hallucination guard compares extracted entities, not meaning. A rewrite such as "led a team" with no number passes.
- Scanned CVs and circulars rely on Gemini vision. There is no local OCR, so without the AI a scanned PDF needs manual entry.

---

## A07 — Automated Multi-Step Workflow

### Design

The engine is our own code, in [`src/lib/workflow/engine.ts`](../src/lib/workflow/engine.ts). It uses three tables:

- **`workflow_runs`**: `idempotency_key` is unique (`ingest:{sha256}`), and `context` holds the accumulated outputs.
- **`workflow_steps`**: unique on `(run_id, name)`, with attempts, `next_attempt_at`, the lease, and the persisted input and output.
- **`workflow_events`**: append-only (a trigger blocks UPDATE and DELETE). It feeds the timeline UI.

Each step is `(ctx) => StepResult`. The result is one of `succeeded(output, next?)`, `skipped`, `waiting`, `retry`, `failed` or `finish(duplicate | succeeded)`; `next` is how a step branches.

- **Claiming.** `SELECT … FOR UPDATE SKIP LOCKED` picks the next due step whose earlier steps are all done, and sets `lease_until = now + 2 min`. If a worker crashes, its lease expires and another worker reclaims the step. A result only counts if the worker still holds the lease, so two workers can never both complete the same step.
- **Persisted outputs.** When a run resumes, completed steps are never re-executed; later steps read their stored `output`.
- **Retries.** Each step has its own max attempts and exponential backoff through `next_attempt_at`. Non-retryable errors fail at once.
- **Triggers.**
  - Next.js `after()`, right after a run is created.
  - `/api/cron/worker` every minute, called by Supabase `pg_cron` + `pg_net` with `CRON_SECRET`, compared in constant time (`npm run db:cron` schedules it).
  - The admin "Run now" action.
- **Compensation.** Cancelling after `create_draft` soft-deletes the draft. A published circular is never unpublished because notifications failed.

### The ingestion steps

These are in [`src/server/workflow/ingest.ts`](../src/server/workflow/ingest.ts):

1. **`validate_input`**: magic bytes, size and sha256. The same content again returns the existing run as **duplicate** (`startIngest`).
2. **`extract_text`**: `unpdf`. If a PDF yields fewer than 200 characters, it is treated as scanned and goes to Gemini vision.
3. **`ai_extract`**: structured extraction through the A06 client, with step-level retries. On the last attempt it falls back to a heuristic draft marked `needs_review`.
4. **`normalize_validate`**: Bangla digits and month names, Dhaka time, district aliases mapped to ids, trigram organization match (or a new unverified organization), and business rules. If a critical field is invalid, the step fails and an admin uses **Edit & continue**.
5. **`dedupe`**: matches on (organization, notice no.) or on very similar title and dates.
   - A later deadline branches to **`apply_update`**: a corrigendum extends the existing circular, with a revision and bookmarker notifications.
   - An exact match ends the run as **`duplicate`**, linked to the existing circular.
6. **`tag_categorize`**: AI with the keyword-dictionary fallback.
7. **`create_draft`**: one transaction for circular + posts + tags. Ids are derived from the run id, so re-running never duplicates. Status `pending_review`, source `pipeline`.
8. **`review_gate`**: continues only if confidence ≥ 0.85, the organization is verified, no fields are flagged and the `auto_publish` flag is on. Otherwise it waits (`waiting_review`). A moderator's approve or reject in `/admin/review` resumes or closes the run (`circular.approved` / `circular.rejected` events).
9. **`publish`**: the Part 2 state machine, then revalidating the job page and `sitemap.xml`.
10. **`notify_matches`**: works through seekers in batches of 200. It matches saved searches, preferences and eligibility, with `dedupe_key = new_match:{circularId}:{userId}`. The batch cursor is saved after every batch, so a retry continues where it stopped. Emails are queued in `email_outbox`.

Admin actions in `/admin/workflows/[runId]`: **Retry failed step**, **Resume from step**, **Skip step** (`tag_categorize` and `notify_matches` only, reason required), **Cancel run** and **Edit extracted data & continue**. All of them are authorized (moderator or admin) and audit-logged.

### Failure scenarios handled

All of these are in `tests/integration/part3.test.ts`, run on real Postgres:

| Scenario | Expected and tested |
|---|---|
| Intermediate step fails after earlier steps succeeded (`failAt: notify_matches`) | earlier steps stay `succeeded`; the failing step retries 3 times, then `failed`; the run is `failed`. **Retry** continues from that step only, `create_draft` is not re-run, exactly one circular exists, and no one gets a second notification |
| Re-running a completed step | upserts with derived ids, so no duplicate rows |
| Same PDF uploaded twice | the second upload returns the first run (`duplicate`) |
| Worker crash | the lease expires and another worker reclaims the step; the old worker's result is discarded |
| Two workers at once | each step succeeds exactly once (counted from the events) |
| `notify_matches` fails between batches | resumes from the saved cursor; each user is notified once |
| Corrigendum / extension | `apply_update` extends the existing circular; no new circular |
| Exact duplicate notice | run ends as `duplicate`, linked to the existing circular |
| Low confidence / unverified organization | `waiting_review`; approval resumes the run, rejection cancels it |
| Invalid critical fields | `normalize_validate` fails; **Edit & continue** fixes it |
| Cancelled after the draft exists | the draft is soft-deleted (compensation) |

### Reproducing the judges' test on the live site

1. Log in as the **admin test account** and open `/admin/ingest`.
2. **Normal run.** Upload `samples/notice-text.pdf` and watch `/admin/workflows/<id>`. Every step runs, then the run stops at **মানুষের রিভিউ** (`waiting_review`). Approve it in `/admin/review`, and the run continues through publish and notify.
3. **Duplicate.** Upload `samples/notice-text-copy.pdf` (same bytes). The page reports *এই সার্কুলার আগেই ইনজেস্ট করা হয়েছে*, with a link to the existing run.
4. **Mid-step failure.** Upload a different file (for example `samples/notice-scanned.pdf`, or paste text). Open *Advanced*, choose **মিলে যাওয়া প্রার্থীদের জানানো** (`notify_matches`) as the step to fail, and start. All earlier steps turn green; `notify_matches` shows 3 attempts and the run is **ব্যর্থ**.
5. Press **আবার চেষ্টা করুন** on the failed step. Only that step runs and the run finishes. The circular exists once (`/admin/circulars`), and the seeker test account has exactly one *নতুন মিল* notification for it.
6. A ready-made failed run is also seeded: open `/admin/ingest`, choose the run named *স্বাস্থ্য অধিদপ্তর — নমুনা (notify ব্যর্থ)* and press Retry.

### Limitations

- The worker runs inside Vercel functions, at most every minute through pg_cron plus `after()`. Very long PDFs share the function time limit with the other due steps; each step is kept short.
- Organization matching uses trigram similarity at 0.45. Very short names can match the wrong organization; the review gate catches this because unverified or new organizations always wait for review.
- There is no automatic scraping of government websites; it is out of scope (spec §11).
