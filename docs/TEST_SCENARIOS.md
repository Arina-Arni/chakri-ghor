# Manual test scenarios for judges

These scripts run on the live site. Test accounts (a seeker and an admin) are shared privately; they are never in the repository. The site runs with `FAULT_INJECTION_ALLOWED=true`, and fault injection affects only the admin who enables it.

The live site shows real circulars only. The PDFs in `samples/` are fictional: every ingested circular waits at review (auto-publish is off), so **reject** sample circulars there and they never go live.

Each scenario lists the steps and then what you should see.

## Core journey

### 1. Search, including AI mode

1. Open `/jobs` as a guest.
2. Type `ঢাকায় সরকারি অফিসের চাকরি` with AI mode on.

**Expected:** filter chips (ঢাকা, সরকারি…) and matching circulars. Removing a chip updates the list and the facet counts.

### 2. Eligibility

1. Log in as the **seeker** and open a government circular with an age limit, for example *ডাক অধিদপ্তর*.
2. Press **যোগ্যতা যাচাই**.

**Expected:** a verdict, plus one row each for age (the exact age on the reference date), education, district and deadline.

### 3. CV

1. On `/profile`, upload a PDF CV after ticking consent.

**Expected:** the extracted fields are offered as suggestions and nothing is saved until you confirm. A renamed image is rejected (wrong type) and a file over 5 MB is rejected.

### 4. Tailored resume

1. From a job page, choose **রিজিউমে সাজান**.

**Expected:** the resume editor shows the ATS score, matched and missing keywords, and AI changes as before/after items you can accept or reject. Download the PDF.

### 5. Tracker

1. Add the job to the tracker and move it from *সেভ করা* to *আবেদন করেছি*.
2. Try to jump straight to *নির্বাচিত*.

**Expected:** the jump is refused with a Bangla reason.

### 6. Dashboards

1. Open `/dashboard` as the seeker.
2. Open `/admin` as the admin.

**Expected:** the numbers match the circulars you can see in `/jobs` and `/admin/circulars`.

## Edge cases

### 7. Duplicate circular upload

1. As the admin, upload `samples/notice-text.pdf` on `/admin/ingest`.
2. Upload `samples/notice-text-copy.pdf`.

**Expected:** the second upload says *আগেই ইনজেস্ট করা হয়েছে* and links to the first run. No second circular is created.

**Then:** reject the first run's circular in `/admin/review`, so the fictional notice never goes live.

### 8. Double-click Apply / Save

Double-click **ট্র্যাকারে যোগ করুন** or the bookmark icon.

**Expected:** one tracker card and one bookmark. The second click replays the first result (idempotency key) or shows *এটি আগেই সেভ করা আছে*.

### 9. Invalid dates

1. In `/onboarding`, enter a date of birth like `৩১/০২/২০০০`.
2. In the admin circular form, set an end date before the start date.

**Expected:** an inline Bangla error, and the form is not submitted.

### 10. IDOR by changing an id

As the seeker, open your resume `/resumes/<id>`, then change one character of the id or paste another user's id.

**Expected:** *পাওয়া যায়নি* (404). It is never "forbidden", and no data is shown.

### 11. Conflicting edits

1. Open `/profile` in two tabs.
2. Save a change in tab A, then save in tab B.

**Expected:** tab B shows the conflict dialog (409) with options to reload or keep your copy.

### 12. Quota exceeded

As a guest, run more than 3 AI searches in one day.

**Expected:** a Bangla message with the reset time. The normal search still works. Signed-in users see their usage on `/billing`.

### 13. AI timeout (A06)

1. As the admin, open `/admin/ai-health` and enable *AI সার্চ → টাইমআউট*.
2. Run an AI search on `/jobs` as the same admin.

**Expected:** results within about 4 s using the simple parser, with a notice. `/admin/ai-health` lists the failure.

**Then:** as the seeker in another browser, the search is unaffected. After 5 failures the breaker shows *open*.

### 14. Workflow mid-step failure (A07)

1. On `/admin/ingest`, open *Advanced*, choose **ড্রাফট তৈরি** (`create_draft`) as the step to fail, and ingest new text or a sample you have not used yet.
2. Press **আবার চেষ্টা করুন** on the failed step.
3. Reject the circular in `/admin/review`.

**Expected after step 1:** the earlier steps are green, and `create_draft` has 3 attempts and has failed.

**Expected after step 2:** only that step runs, one draft exists, and the run waits at review.

**Expected after step 3:** the run closes and nothing is published.

**Variant after publishing:** with a real circular, fail **মিলে যাওয়া প্রার্থীদের জানানো** (`notify_matches`) instead, then approve it at review and Retry the failed step. The run completes with one circular and no duplicate notifications. The integration test runs this exact scenario.

### 15. Corrigendum

Ingest text with the same organization and notice number as an existing circular, but a later deadline.

**Expected:** the workflow takes the `apply_update` branch. The existing circular's deadline is extended, a *সময় বৃদ্ধি* notification goes to bookmarkers, and no new circular is created.

### 16. Session expiry

1. Sign out in another tab.
2. Submit a form in the first tab.

**Expected:** the *session expired* dialog appears, and the draft is kept.

### 17. Payments

1. As the seeker, open `/billing` and start the trial.
2. Try to start it again.
3. Use the test checkout (*সফল*).

**Expected:** the second trial is refused, and the checkout activates Premium. Replaying the same webhook never extends the period twice (see the integration test "duplicate webhook").
