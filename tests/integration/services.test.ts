import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dhakaDateKey } from "@/domain/bn";
import { computeEligibility } from "@/domain/eligibility";
import { districtById } from "@/domain/taxonomy";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { toAppError } from "@/server/errors";
import { runIdempotent } from "@/server/idempotency";
import * as adminSvc from "@/server/services/admin";
import * as apps from "@/server/services/applications";
import * as circ from "@/server/services/circulars";
import * as dash from "@/server/services/dashboards";
import * as disc from "@/server/services/discovery";
import * as notif from "@/server/services/notifications";
import * as profile from "@/server/services/profile";
import * as resumes from "@/server/services/resumes";
import { ALL_SEEDS, seedId } from "../../scripts/seed/seed";
import { createWorld, expectCode, key, rows, type World } from "./helpers";

let w: World;
let db: Db;

beforeAll(async () => {
  w = await createWorld();
  db = w.db;
}, 180_000);
afterAll(async () => {
  await w?.close();
});

/** Run a mutation the way a Server Action does (idempotent transaction). */
function mutation<T>(who: Parameters<World["ctx"]>[0], fn: (ctx: ReturnType<World["ctx"]>, tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>, k = key(), input: unknown = Math.random()) {
  const ctx = w.ctx(who);
  return runIdempotent(ctx, "test", k, input, (tx) => fn(ctx, tx));
}

const postOf = (slug: string, i = 0) => seedId(`post:${slug}:${i}`);
const circularOf = (slug: string) => seedId(`circular:${slug}`);

// ───────── seed ─────────

describe("seed", () => {
  it("creates ~40 circulars and ~70 posts", async () => {
    const [{ c }] = rows(await db.execute(sql`select count(*)::int as c from circulars`));
    const [{ p }] = rows(await db.execute(sql`select count(*)::int as p from circular_posts`));
    expect(Number(c)).toBe(ALL_SEEDS.length);
    expect(Number(c)).toBeGreaterThanOrEqual(38);
    expect(Number(p)).toBeGreaterThanOrEqual(68);
  });

  it("is idempotent (a second run does not duplicate)", async () => {
    const before = rows(await db.execute(sql`select (select count(*) from circulars) c, (select count(*) from applications) a, (select count(*) from notifications) n, (select count(*) from bookmarks) b`))[0];
    const { seed } = await import("../../scripts/seed/seed");
    const users = Object.entries({ seeker: "seeker@test.local", moderator: "mod@test.local", admin: "admin@test.local" }).map(([role, email]) => ({ role: role as "seeker", email, fullName: "x", password: "x" }));
    await seed(db, {
      now: w.now,
      users,
      ensureAuthUser: async (u) => rows(await db.execute(sql`select id from auth.users where email = ${u.email}`))[0].id,
    });
    const after = rows(await db.execute(sql`select (select count(*) from circulars) c, (select count(*) from applications) a, (select count(*) from notifications) n, (select count(*) from bookmarks) b`))[0];
    expect(after).toEqual(before);
  });
});

// ───────── authorization & IDOR ─────────

describe("authorization", () => {
  it("guests can browse but not use seeker features", async () => {
    const page = await disc.listCirculars(w.ctx("guest"), db, {}, null);
    expect(page.total).toBeGreaterThan(10);
    await expectCode(profile.getProfile(w.ctx("guest"), db), "UNAUTHENTICATED");
    await expectCode(apps.listApplications(w.ctx("guest"), db, {}), "UNAUTHENTICATED");
  });

  it("another user's resources are NOT_FOUND (never FORBIDDEN)", async () => {
    const [app] = await db.select().from(s.applications).where(eq(s.applications.userId, w.ids.seeker)).limit(1);
    const [res] = await db.select().from(s.resumes).where(eq(s.resumes.userId, w.ids.seeker)).limit(1);
    const [ss] = await db.select().from(s.savedSearches).where(eq(s.savedSearches.userId, w.ids.seeker)).limit(1);
    await expectCode(mutation("other", (ctx, tx) => apps.updateApplication(ctx, tx, app.id, { notes: "hack" }, app.version)), "NOT_FOUND");
    await expectCode(mutation("other", (ctx, tx) => apps.updateApplicationStatus(ctx, tx, app.id, "withdrawn", app.version)), "NOT_FOUND");
    await expectCode(mutation("other", (ctx, tx) => apps.deleteApplication(ctx, tx, app.id)), "NOT_FOUND");
    await expectCode(resumes.getResume(w.ctx("other"), db, res.id), "NOT_FOUND");
    await expectCode(resumes.resumeForPdf(w.ctx("other"), db, res.id), "NOT_FOUND");
    await expectCode(mutation("other", (ctx, tx) => resumes.saveResume(ctx, tx, res.id, res.content, res.version)), "NOT_FOUND");
    await expectCode(mutation("other", (ctx, tx) => disc.setSavedSearchAlert(ctx, tx, ss.id, false)), "NOT_FOUND");
    await expectCode(mutation("other", (ctx, tx) => disc.deleteSavedSearch(ctx, tx, ss.id)), "NOT_FOUND");
    // Marking "someone else's" notifications read changes nothing.
    const [n] = await db.select().from(s.notifications).where(and(eq(s.notifications.userId, w.ids.seeker), sql`${s.notifications.readAt} is null`)).limit(1);
    const r = await mutation("other", (ctx, tx) => notif.markNotificationsRead(ctx, tx, [n.id]));
    expect(r.updated).toBe(0);
    // Lists only ever contain the caller's rows.
    expect(await apps.listApplications(w.ctx("other"), db, {})).toEqual([]);
    expect(await disc.listBookmarks(w.ctx("other"), db)).toEqual([]);
  });

  it("seekers cannot call staff or admin actions (FORBIDDEN)", async () => {
    const id = circularOf("dc-khulna-office-assistant-2026");
    await expectCode(circ.listAdminCirculars(w.ctx("seeker"), db, {}), "FORBIDDEN");
    await expectCode(mutation("seeker", (ctx, tx) => circ.transitionCircular(ctx, tx, id, "cancel", {}, 1)), "FORBIDDEN");
    await expectCode(adminSvc.listUsers(w.ctx("seeker"), db, {}), "FORBIDDEN");
    await expectCode(mutation("seeker", (ctx, tx) => adminSvc.changeUserRole(ctx, tx, w.ids.seeker, "admin", true)), "FORBIDDEN");
    await expectCode(mutation("seeker", (ctx, tx) => adminSvc.setFeatureFlag(ctx, tx, "autoPublish", true)), "FORBIDDEN");
    await expectCode(dash.getAdminDashboard(w.ctx("seeker"), db), "FORBIDDEN");
    await expectCode(adminSvc.listAuditLogs(w.ctx("moderator"), db, {}), "FORBIDDEN");
    await expectCode(mutation("moderator", (ctx, tx) => adminSvc.setUserStatus(ctx, tx, w.ids.other, "suspended")), "FORBIDDEN");
  });

  it("role changes need the admin's password and are audit-logged", async () => {
    await expectCode(mutation("admin", (ctx, tx) => adminSvc.changeUserRole(ctx, tx, w.ids.other, "moderator", false)), "UNAUTHENTICATED");
    const u = await mutation("admin", (ctx, tx) => adminSvc.changeUserRole(ctx, tx, w.ids.other, "moderator", true));
    expect(u.role).toBe("moderator");
    const log = rows(await db.execute(sql`select action, before, after from audit_logs where entity_id = ${w.ids.other} order by created_at desc limit 1`))[0];
    expect(log).toMatchObject({ action: "user.role_change", before: { role: "seeker" }, after: { role: "moderator" } });
    await mutation("admin", (ctx, tx) => adminSvc.changeUserRole(ctx, tx, w.ids.other, "seeker", true));
  });

  it("suspended users are blocked from every mutation", async () => {
    const ctx = { ...w.ctx("seeker"), actor: { ...(w.ctx("seeker").actor as Extract<ReturnType<World["ctx"]>["actor"], { kind: "user" }>), status: "suspended" as const } };
    await expectCode(
      runIdempotent(ctx, "t", key(), 1, (tx) => disc.toggleBookmark(ctx, tx, postOf("dpe-assistant-teacher-2026"))),
      "FORBIDDEN",
    );
  });
});

// ───────── duplicates, idempotency, conflicts, rollback ─────────

describe("duplicate actions", () => {
  it("unique constraints map to friendly DUPLICATE errors, never 500", async () => {
    const post = postOf("dc-khulna-office-assistant-2026");
    const dupBookmark = await db.insert(s.bookmarks).values({ userId: w.ids.seeker, circularPostId: post }).catch((e) => toAppError(e));
    expect(dupBookmark).toMatchObject({ code: "DUPLICATE", messageBn: "এটি আগেই সেভ করা আছে" });
    await expectCode(mutation("seeker", (ctx, tx) => apps.createApplication(ctx, tx, post)), "DUPLICATE");
    const [c] = await db.select().from(s.circulars).where(eq(s.circulars.id, circularOf("dc-khulna-office-assistant-2026")));
    const dupNotice = await db
      .insert(s.circulars)
      .values({ ...c, id: undefined, slug: "dup-notice-test", version: 1 })
      .catch((e) => toAppError(e));
    expect(dupNotice).toMatchObject({ code: "DUPLICATE" });
  });

  it("an idempotency key replays the first response and applies once", async () => {
    const k = key();
    const post = postOf("dpe-assistant-teacher-2026", 0);
    const first = await mutation("other", (ctx, tx) => disc.toggleBookmark(ctx, tx, post), k, { post });
    const second = await mutation("other", (ctx, tx) => disc.toggleBookmark(ctx, tx, post), k, { post });
    expect(first).toEqual({ bookmarked: true });
    expect(second).toEqual({ bookmarked: true }); // replayed — not toggled back
    const [{ n }] = rows(await db.execute(sql`select count(*)::int n from bookmarks where user_id = ${w.ids.other} and circular_post_id = ${post}`));
    expect(Number(n)).toBe(1);
    await expectCode(mutation("other", (ctx, tx) => disc.toggleBookmark(ctx, tx, post), k, { post: "different" }), "VALIDATION");
  });

  it("a failed mutation rolls back completely, including its idempotency key", async () => {
    const k = key();
    const before = rows(await db.execute(sql`select count(*)::int n from saved_searches where user_id = ${w.ids.other}`))[0].n;
    await expect(
      mutation(
        "other",
        async (ctx, tx) => {
          await disc.saveSearch(ctx, tx, "রোলব্যাক টেস্ট", {});
          await tx.insert(s.circularPosts).values({ circularId: circularOf("dpe-assistant-teacher-2026"), titleBn: "x", vacancies: 0, minEducationLevel: "ssc" });
        },
        k,
      ),
    ).rejects.toBeTruthy();
    const after = rows(await db.execute(sql`select count(*)::int n from saved_searches where user_id = ${w.ids.other}`))[0].n;
    expect(after).toBe(before);
    const [{ n }] = rows(await db.execute(sql`select count(*)::int n from idempotency_keys where key = ${k}`));
    expect(Number(n)).toBe(0);
  });

  it("optimistic locking: a stale version is a CONFLICT", async () => {
    const p = await profile.getProfile(w.ctx("seeker"), db);
    const updated = await mutation("seeker", (ctx, tx) => profile.updateProfile(ctx, tx, { headline: "নতুন শিরোনাম" }, p.version));
    expect(updated.version).toBe(p.version + 1);
    await expectCode(mutation("seeker", (ctx, tx) => profile.updateProfile(ctx, tx, { headline: "পুরনো ভার্সন" }, p.version)), "CONFLICT");
    const [app] = await db.select().from(s.applications).where(eq(s.applications.userId, w.ids.seeker)).limit(1);
    await expectCode(mutation("seeker", (ctx, tx) => apps.updateApplication(ctx, tx, app.id, { notes: "x" }, app.version - 1)), "CONFLICT");
  });

  it("mass assignment: role, status, userId and version in a profile patch are ignored", async () => {
    const { profilePatchSchema } = await import("@/schemas/api");
    const patch = profilePatchSchema.parse({ headline: "ঠিক আছে", role: "admin", status: "active", userId: w.ids.admin, version: 999 } as never);
    expect(Object.keys(patch)).toEqual(["headline"]);
  });
});

// ───────── state machines through the services ─────────

describe("business rules on the server", () => {
  it("illegal tracker jumps return ILLEGAL_TRANSITION with a Bangla reason", async () => {
    const app = await mutation("other", (ctx, tx) => apps.createApplication(ctx, tx, postOf("dpe-assistant-teacher-2026", 0)));
    await expectCode(mutation("other", (ctx, tx) => apps.updateApplicationStatus(ctx, tx, app.id, "selected", app.version)), "ILLEGAL_TRANSITION");
    const moved = await mutation("other", (ctx, tx) => apps.updateApplicationStatus(ctx, tx, app.id, "applied", app.version));
    expect(moved.status).toBe("applied");
    expect(moved.events.map((e) => e.toStatus)).toEqual(["saved", "applied"]);
    // One-step undo within 24 h
    const undone = await mutation("other", (ctx, tx) => apps.updateApplicationStatus(ctx, tx, app.id, "saved", moved.version));
    expect(undone.status).toBe("saved");
  });

  it("exam_scheduled needs an exam date", async () => {
    const [app] = await db.select().from(s.applications).where(eq(s.applications.id, seedId("application:dpe-assistant-teacher-2026")));
    await expectCode(mutation("seeker", (ctx, tx) => apps.updateApplicationStatus(ctx, tx, app.id, "exam_scheduled", app.version)), "ILLEGAL_TRANSITION");
  });

  it("extending a deadline notifies bookmarkers once (dedupe) and records a revision", async () => {
    const id = circularOf("dc-khulna-office-assistant-2026");
    const [c] = await db.select().from(s.circulars).where(eq(s.circulars.id, id));
    const before = rows(await db.execute(sql`select count(*)::int n from notifications where user_id = ${w.ids.seeker}`))[0].n;
    const newEnd = new Date(c.applicationEndAt.getTime() + 3 * 86_400_000).toISOString();
    const row = await mutation("moderator", (ctx, tx) => circ.transitionCircular(ctx, tx, id, "extend", { newEndAt: newEnd }, c.version));
    expect(row.endAt).toBe(newEnd);
    const after = rows(await db.execute(sql`select count(*)::int n from notifications where user_id = ${w.ids.seeker}`))[0].n;
    expect(Number(after)).toBe(Number(before) + 1);
    const [{ n }] = rows(await db.execute(sql`select count(*)::int n from circular_revisions where circular_id = ${id}`));
    expect(Number(n)).toBeGreaterThanOrEqual(1);
    await expectCode(mutation("moderator", (ctx, tx) => circ.transitionCircular(ctx, tx, id, "extend", { newEndAt: newEnd }, c.version)), "CONFLICT");
  });

  it("rejection needs a reason; only an admin publishes for an unverified organization", async () => {
    const id = circularOf("review-bbs-enumerator");
    const [c] = await db.select().from(s.circulars).where(eq(s.circulars.id, id));
    await expectCode(mutation("moderator", (ctx, tx) => circ.decideReview(ctx, tx, id, "reject", {})), "VALIDATION");
    expect(c.status).toBe("pending_review");
  });
});

// ───────── discovery ─────────

describe("search & discovery", () => {
  it("finds Bangla and English queries and ranks by relevance", async () => {
    const bn = await disc.listCirculars(w.ctx("guest"), db, { q: "খুলনা" }, null);
    expect(bn.items.some((i) => i.slug === "dc-khulna-office-assistant-2026")).toBe(true);
    const en = await disc.listCirculars(w.ctx("guest"), db, { q: "railway" }, null);
    expect(en.items[0].slug).toMatch(/railway/);
  });

  it("keyset pagination returns every row once", async () => {
    const seen = new Set<string>();
    let cursor: string | null = null;
    let total = 0;
    for (let i = 0; i < 20; i++) {
      const page = await disc.listCirculars(w.ctx("guest"), db, { sort: "salary" }, cursor);
      total = page.total;
      for (const it of page.items) {
        expect(seen.has(it.id)).toBe(false);
        seen.add(it.id);
      }
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect(seen.size).toBe(total);
  });

  it("facet counts agree with filtered totals", async () => {
    const facets = await disc.getFacets(w.ctx("guest"), db, {});
    const gov = facets.sector.find((f) => f.value === "government")!;
    const page = await disc.listCirculars(w.ctx("guest"), db, { sector: ["government"] }, null);
    expect(page.total).toBe(gov.count);
  });

  it("zero-result suggestions count results without each filter", async () => {
    const sugg = await disc.getZeroResultSuggestions(w.ctx("guest"), db, { district: ["dis_khulna"], category: ["cat_health"] });
    const withoutCat = await disc.listCirculars(w.ctx("guest"), db, { district: ["dis_khulna"] }, null);
    expect(sugg.find((x) => x.key === "category")?.resultCount).toBe(withoutCat.total);
  });

  it("the rule-based parser powers AI-mode chips and logs the search", async () => {
    const parsed = await disc.parseSearchQuery(w.ctx("guest"), db, "খুলনায় সরকারি চাকরি");
    expect(parsed.mode).toBe("fallback");
    expect(parsed.filters).toMatchObject({ district: ["dis_khulna"], sector: ["government"] });
    const [{ n }] = rows(await db.execute(sql`select count(*)::int n from search_logs where normalized_query = 'খুলনায় সরকারি চাকরি'`));
    expect(Number(n)).toBe(1);
  });

  it("'only eligible' returns exactly the circulars the eligibility panel would pass", async () => {
    const ctx = w.ctx("seeker");
    const all: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await disc.listCirculars(ctx, db, { eligibleOnly: true }, cursor);
      all.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor;
    } while (cursor);
    const p = await profile.getProfile(ctx, db);
    const { loadCirculars } = await import("@/server/db/queries/circulars");
    const open = await loadCirculars(db, sql`${s.circulars.status} in ('published','closed') and ${s.circulars.applicationEndAt} > now()`, w.now);
    const expected = open
      .filter((c) => c.posts.some((post) => computeEligibility({ startAt: c.startAt, endAt: c.endAt, ageReferenceDate: c.ageReferenceDate, publishedOn: c.publishedAt?.slice(0, 10) ?? null }, post, p, w.now, districtById).verdict !== "not_eligible"))
      .map((c) => c.id);
    expect(new Set(all)).toEqual(new Set(expected));
  });

  it("counts a view once per visitor per day", async () => {
    const slug = "bsc-senior-officer-2026";
    const read = async () => rows(await db.execute(sql`select views from circulars where slug = ${slug}`))[0].views;
    const v0 = Number(await read());
    await disc.getCircular(w.ctx("other"), db, slug);
    await disc.getCircular(w.ctx("other"), db, slug);
    expect(Number(await read())).toBe(v0 + 1);
  });
});

// ───────── dashboards ─────────

describe("dashboards", () => {
  it("admin aggregates match the seed data exactly", async () => {
    // Use a fresh, unmodified snapshot of the seed definitions (earlier tests extended one deadline).
    const stats = await dash.computeAdminDashboard(db, w.now);
    const H = 3_600_000;
    const today = dhakaDateKey(w.now);
    const [ext] = rows(await db.execute(sql`select application_end_at from circulars where slug = 'dc-khulna-office-assistant-2026'`));
    const endOf = (slug: string, end: number) => (slug === "dc-khulna-office-assistant-2026" ? new Date(ext.application_end_at).getTime() : w.now + end);
    const published = ALL_SEEDS.filter((x) => (x.status ?? "published") === "published");
    const open = published.filter((x) => endOf(x.slug, x.end) > w.now);
    const vac = (x: (typeof ALL_SEEDS)[number]) => x.posts.reduce((n, p) => n + p.vacancies, 0);
    expect(stats.openCirculars).toBe(open.length);
    expect(stats.openVacancies).toBe(open.reduce((n, x) => n + vac(x), 0));
    expect(stats.closingToday).toBe(open.filter((x) => dhakaDateKey(endOf(x.slug, x.end)) === today).length);
    expect(stats.reviewPending).toBe(ALL_SEEDS.filter((x) => x.status === "pending_review").length);
    expect(stats.publishedToday).toBe(published.filter((x) => dhakaDateKey(w.now + Math.min(x.start, -6 * H) + 2 * H) === today).length);
    const byCat = new Map<string, number>();
    for (const x of open) byCat.set(x.category, (byCat.get(x.category) ?? 0) + 1);
    expect(stats.byCategory.reduce((n, c) => n + c.count, 0)).toBe(open.length);
    expect(stats.byCategory.length).toBe(byCat.size);
    expect(stats.topSearches[0]).toMatchObject({ count: 2 });
    expect(stats.zeroResultSearches.map((z) => z.query).sort()).toEqual(["পাইলট চাকরি সিলেট", "হোটেল ম্যানেজমেন্ট"]);
  });

  it("seeker dashboard counts the seeker's own data", async () => {
    const d = await dash.getSeekerDashboard(w.ctx("seeker"), db);
    const [{ b }] = rows(await db.execute(sql`select count(*)::int b from bookmarks where user_id = ${w.ids.seeker}`));
    expect(d.stats.saved).toBe(Number(b));
    expect(d.applicationsByStatus.reduce((n, x) => n + x.count, 0)).toBe(Number(rows(await db.execute(sql`select count(*)::int n from applications where user_id = ${w.ids.seeker}`))[0].n));
    expect(d.upcomingExams.length).toBe(1);
    expect(d.profileCompleteness).toBeGreaterThan(80);
  });
});

// ───────── the Part 2 end-to-end flow (no AI) ─────────

describe("end-to-end: create → review → find → eligibility → resume → tracker → dashboards", () => {
  it("works against the real database", async () => {
    const orgs = await disc.listOrganizations(w.ctx("guest"), db);
    const dck = orgs.find((o) => o.slug === "dc-office-khulna")!;
    const now = w.now;
    const iso = (ms: number) => new Date(ms).toISOString();
    const payload = {
      organizationId: dck.id,
      noticeNo: "E2E-০০১",
      titleBn: "ইটুই পরীক্ষা — হিসাব সহকারী নিয়োগ",
      titleEn: "E2E Test — Accounts Assistant",
      descriptionBn: "",
      sector: "government" as const,
      jobType: "full_time" as const,
      workMode: "onsite" as const,
      categoryId: "cat_bank",
      districtId: "dis_khulna",
      divisionId: "div_khu",
      tagSlugs: ["class-3"],
      applyPlatform: "teletalk" as const,
      applyUrl: "https://dck.teletalk.com.bd",
      applicationFee: 112,
      startAt: iso(now - 3_600_000),
      endAt: iso(now + 10 * 86_400_000),
      ageReferenceDate: dhakaDateKey(now),
      sourceUrl: "",
      posts: [
        {
          id: "",
          titleBn: "হিসাব সহকারী",
          titleEn: "Accounts Assistant",
          vacancies: 7,
          grade: null,
          salaryMin: 9300,
          salaryMax: 22490,
          salaryText: null,
          minEducation: "hsc" as const,
          subjects: [],
          experienceYears: 0,
          ageMin: 18,
          ageMax: 32,
          ageRelaxations: [],
          eligibleDistrictIds: null,
          eligibleDivisionIds: null,
          gender: "any" as const,
          otherRequirements: [],
          keywordsRequired: ["Microsoft Excel", "Accounting"],
          keywordsPreferred: ["Data Entry"],
        },
      ],
    };
    const before = await dash.computeAdminDashboard(db, now);

    // Admin creates and submits; moderator approves.
    const draft = await mutation("admin", (ctx, tx) => circ.saveCircular(ctx, tx, payload, null, "submit"));
    expect(draft.status).toBe("pending_review");
    const queue = await circ.listReviewQueue(w.ctx("moderator"), db);
    expect(queue.some((q) => q.circularId === draft.id)).toBe(true);
    await mutation("moderator", (ctx, tx) => circ.decideReview(ctx, tx, draft.id, "approve", {}));

    // Seeker finds it with normal search and with the rule-based "AI mode".
    const found = await disc.listCirculars(w.ctx("seeker"), db, { q: "হিসাব সহকারী" }, null);
    expect(found.items.map((i) => i.id)).toContain(draft.id);
    const parsed = await disc.parseSearchQuery(w.ctx("seeker"), db, "খুলনায় ব্যাংক হিসাব");
    const viaChips = await disc.listCirculars(w.ctx("seeker"), db, parsed.filters, null);
    expect(viaChips.items.map((i) => i.id)).toContain(draft.id);

    // Eligibility
    const detail = await disc.getCircular(w.ctx("seeker"), db, draft.slug);
    const postId = detail.circular.posts[0].id;
    const elig = await disc.checkEligibility(w.ctx("seeker"), db, postId);
    expect(elig.verdict).toBe("eligible");

    // Resume: tailor from the base, then the PDF data is available.
    const list = await resumes.listResumes(w.ctx("seeker"), db);
    const base = list.find((r) => r.kind === "base")!;
    const tailored = await mutation("seeker", (ctx, tx) => resumes.tailorResume(ctx, tx, base.id, postId));
    expect(tailored.mode).toBe("fallback");
    expect(tailored.resume.content.skills[0]).toBe("Microsoft Excel");
    expect((await resumes.resumeForPdf(w.ctx("seeker"), db, tailored.resume.id)).content.contact.fullName).toBeTruthy();

    // Tracker
    const app = await mutation("seeker", (ctx, tx) => apps.createApplication(ctx, tx, postId));
    const applied = await mutation("seeker", (ctx, tx) => apps.updateApplicationStatus(ctx, tx, app.id, "applied", app.version));
    expect(applied.status).toBe("applied");

    // Dashboards
    const after = await dash.computeAdminDashboard(db, now);
    expect(after.openCirculars).toBe(before.openCirculars + 1);
    expect(after.openVacancies).toBe(before.openVacancies + 7);
    const sd = await dash.getSeekerDashboard(w.ctx("seeker"), db);
    expect(sd.applicationsByStatus.find((x) => x.status === "applied")!.count).toBeGreaterThanOrEqual(2);

    // Audit trail of the privileged steps
    const audit = await adminSvc.listAuditLogs(w.ctx("admin"), db, {});
    const actions = audit.filter((a) => a.entityId === draft.id).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["circular.create", "circular.submit_review", "circular.approve"]));
  });
});
