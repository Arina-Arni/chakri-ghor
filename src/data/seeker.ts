// TEMP — replaced by the real implementation in Part 2
import { t } from "@/i18n";
import { dhakaDateKey } from "@/domain/bn";
import type {
  Application,
  ApplicationPatch,
  ApplicationStatus,
  Billing,
  Bookmark,
  CircularListItem,
  CvParseResult,
  EligibilityResult,
  JobFilters,
  Me,
  Notification,
  OnboardingStep,
  Profile,
  Result,
  SavedSearch,
  SeekerDashboard,
  Settings,
} from "@/types";
import { ai, fail, mutate, nowIso, ok, read, uid } from "./_runtime";
import { getRole, setRole } from "./session";
import { toListItem } from "./discovery";
import { getDb } from "./fixtures/db";
import { computeEligibility } from "./fixtures/eligibility";

const H = 3_600_000;
const DAY = 24 * H;

function requireSeeker<T>(): Result<T> | null {
  return getRole() === "guest" ? fail("UNAUTHENTICATED") : null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]).join("");
}

/** Share of profile items filled in, and the Bangla names of what's missing. */
export function profileCompleteness(p: Profile): { pct: number; missing: string[] } {
  const items: [boolean, string][] = [
    [Boolean(p.fullName), "নাম"],
    [Boolean(p.dateOfBirth), "জন্ম তারিখ"],
    [Boolean(p.gender), "লিঙ্গ"],
    [Boolean(p.phone), "মোবাইল নম্বর"],
    [Boolean(p.homeDistrictId), "নিজ জেলা"],
    [Boolean(p.headline), "পেশাগত শিরোনাম"],
    [Boolean(p.summary), "সংক্ষিপ্ত পরিচিতি"],
    [p.educations.length > 0, "শিক্ষাগত যোগ্যতা"],
    [p.experiences.length > 0, "কাজের অভিজ্ঞতা"],
    [p.skills.length >= 3, "কমপক্ষে ৩টি দক্ষতা"],
    [p.preferences.categoryIds.length > 0, "পছন্দের ক্যাটাগরি"],
    [p.preferences.minSalary != null, "ন্যূনতম বেতনের পছন্দ"],
  ];
  const done = items.filter(([ok]) => ok).length;
  return { pct: Math.round((done / items.length) * 100), missing: items.filter(([ok]) => !ok).map(([, l]) => l) };
}

function refreshCompleteness(p: Profile) {
  const c = profileCompleteness(p);
  p.completeness = c.pct;
  p.missingItems = c.missing;
}

// ───────── session & profile ─────────

export async function getMe(): Promise<Result<Me | null>> {
  return read(() => {
    const role = getRole();
    if (role === "guest") return null;
    const db = getDb();
    const p = db.profile;
    const names = { seeker: p.fullName, moderator: "তানভীর হাসান", admin: "নুসরাত জাহান" } as const;
    const fullName = names[role];
    return {
      id: role === "seeker" ? p.userId : `usr_${role}`,
      role,
      fullName,
      email: role === "seeker" ? p.email : `${role}@chakriradar.test`,
      initials: initials(fullName),
      onboardingStep: p.onboardingStep,
      onboardingCompleted: p.onboardingCompleted,
      profileCompleteness: p.completeness,
      planId: db.billing.subscription.planId,
      unreadNotifications: db.notifications.filter((n) => !n.readAt).length,
    };
  }, { ignoreForced: true });
}

export async function getProfile(): Promise<Result<Profile>> {
  return read(() => requireSeeker<Profile>() ?? ok(structuredClone(getDb().profile)));
}

export async function updateProfile(patch: Partial<Profile>, version: number, idempotencyKey: string): Promise<Result<Profile>> {
  return mutate(
    idempotencyKey,
    () => {
      const db = getDb();
      if (version !== db.profile.version) return fail<Profile>("CONFLICT");
      Object.assign(db.profile, patch, { version: db.profile.version + 1, updatedAt: nowIso() });
      refreshCompleteness(db.profile);
      return ok(structuredClone(db.profile));
    },
    { versioned: true },
  );
}

export async function saveOnboardingStep(step: OnboardingStep, data: Partial<Profile>, idempotencyKey: string): Promise<Result<Profile>> {
  return mutate(idempotencyKey, () => {
    const db = getDb();
    Object.assign(db.profile, data);
    db.profile.onboardingStep = Math.min(4, Math.max(db.profile.onboardingStep, step + 1)) as OnboardingStep;
    if (step === 4) {
      db.profile.onboardingCompleted = true;
      db.profile.aiFilledFields = [];
    }
    db.profile.version += 1;
    db.profile.updatedAt = nowIso();
    refreshCompleteness(db.profile);
    return ok(structuredClone(db.profile));
  });
}

/**
 * Sample CV parsing. File names drive the outcome so every state can be demoed:
 * "*locked*" → password-protected, "*scan*"/"*fail*" → unreadable (contact details only).
 */
export async function uploadCv(
  file: File,
  idempotencyKey: string,
  opts: { onProgress?: (pct: number) => void } = {},
): Promise<Result<CvParseResult>> {
  void idempotencyKey; // Part 2 dedupes parse jobs by key; fixtures parse every time.
  const name = file.name.toLowerCase();
  if (file.size > 5 * 1024 * 1024) return fail("FILE_TOO_LARGE");
  if (!/\.(pdf|docx|txt)$/.test(name)) return fail("FILE_TYPE");
  for (let pct = 10; pct <= 100; pct += 30) {
    opts.onProgress?.(Math.min(pct, 100));
    await new Promise((r) => setTimeout(r, 180));
  }
  opts.onProgress?.(100);
  if (name.includes("locked") || name.includes("protected")) return fail("FILE_ENCRYPTED");
  const usage = getDb().billing.usage.find((u) => u.feature === "cv_parse")!;
  return ai<CvParseResult>(
    (mode) => {
      if (usage.used >= usage.limit) return fail("QUOTA_EXCEEDED", { retryAfterSec: 3600 });
      usage.used++;
      if (mode === "fallback" || name.includes("scan") || name.includes("fail")) {
        return {
          status: "partial",
          extracted: { email: "rahima@example.com", phone: "01712345678", links: [{ label: "LinkedIn", url: "https://www.linkedin.com/in/example" }] },
          aiFilledFields: [],
        };
      }
      return {
        status: "parsed",
        extracted: {
          fullName: "রহিমা আক্তার",
          email: "rahima@example.com",
          phone: "01712345678",
          headline: "অফিস সহকারী · ৩ বছরের অভিজ্ঞতা",
          summary: "উপজেলা অফিসে নথি ব্যবস্থাপনা, টাইপিং ও ডাটা এন্ট্রির অভিজ্ঞতা।",
          skills: ["Computer Typing", "Data Entry", "MS Office"],
          experiences: [
            {
              id: uid("exp"),
              title: "অফিস সহকারী",
              organization: "উপজেলা নির্বাহী অফিসারের কার্যালয়, ডুমুরিয়া",
              startDate: "2023-02-01",
              endDate: null,
              current: true,
              bullets: ["চিঠিপত্র টাইপ ও নথি সংরক্ষণ"],
            },
          ],
        },
        aiFilledFields: ["headline", "summary", "experiences", "skills"],
      };
    },
  );
}

export async function checkEligibility(postId: string): Promise<Result<EligibilityResult>> {
  return read(() => {
    if (getRole() === "guest") return fail<EligibilityResult>("UNAUTHENTICATED");
    const db = getDb();
    if (!db.profile.onboardingCompleted) return fail<EligibilityResult>("PROFILE_INCOMPLETE");
    const c = db.circulars.find((x) => x.posts.some((p) => p.id === postId));
    if (!c) return fail<EligibilityResult>("NOT_FOUND");
    return ok(computeEligibility(c, c.posts.find((p) => p.id === postId)!, db.profile, Date.now()));
  });
}

// ───────── bookmarks & saved searches ─────────

export async function toggleBookmark(postId: string, idempotencyKey: string): Promise<Result<{ bookmarked: boolean }>> {
  return mutate(idempotencyKey, () => {
    const guard = requireSeeker<{ bookmarked: boolean }>();
    if (guard) return guard;
    const db = getDb();
    const i = db.bookmarks.findIndex((b) => b.postId === postId);
    if (i >= 0) {
      db.bookmarks.splice(i, 1);
      return { bookmarked: false };
    }
    const c = db.circulars.find((x) => x.posts.some((p) => p.id === postId));
    if (!c) return fail<{ bookmarked: boolean }>("NOT_FOUND");
    db.bookmarks.unshift({ id: uid("bm"), postId, circularId: c.id, createdAt: nowIso() });
    return { bookmarked: true };
  });
}

export async function listBookmarks(): Promise<Result<(Bookmark & { job: CircularListItem })[]>> {
  return read(
    () => {
      const guard = requireSeeker<(Bookmark & { job: CircularListItem })[]>();
      if (guard) return guard;
      const db = getDb();
      const set = new Set(db.bookmarks.map((b) => b.postId));
      return ok(
        db.bookmarks.map((b) => ({ ...b, job: toListItem(db.circulars.find((c) => c.id === b.circularId)!, set) })),
      );
    },
    { empty: () => [] },
  );
}

export async function saveSearch(name: string, filters: JobFilters, idempotencyKey: string): Promise<Result<SavedSearch>> {
  return mutate(idempotencyKey, () => {
    const guard = requireSeeker<SavedSearch>();
    if (guard) return guard;
    const s: SavedSearch = { id: uid("ss"), name, filters, alertEnabled: true, newMatchCount: 0, createdAt: nowIso() };
    getDb().savedSearches.unshift(s);
    return s;
  });
}

export async function listSavedSearches(): Promise<Result<SavedSearch[]>> {
  return read(() => requireSeeker<SavedSearch[]>() ?? ok(structuredClone(getDb().savedSearches)), { empty: () => [] });
}

export async function setSavedSearchAlert(id: string, enabled: boolean, idempotencyKey: string): Promise<Result<SavedSearch>> {
  return mutate(idempotencyKey, () => {
    const s = getDb().savedSearches.find((x) => x.id === id);
    if (!s) return fail<SavedSearch>("NOT_FOUND");
    s.alertEnabled = enabled;
    return ok({ ...s });
  });
}

export async function deleteSavedSearch(id: string, idempotencyKey: string): Promise<Result<{ id: string }>> {
  return mutate(idempotencyKey, () => {
    const db = getDb();
    db.savedSearches = db.savedSearches.filter((s) => s.id !== id);
    return { id };
  });
}

// ───────── applications ─────────

/** Allowed status moves. The Part 2 API enforces the same table. */
export const APPLICATION_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  interested: ["applied", "withdrawn"],
  applied: ["admit_card", "rejected", "withdrawn"],
  admit_card: ["exam", "withdrawn"],
  exam: ["viva", "selected", "rejected"],
  viva: ["selected", "rejected"],
  selected: [],
  rejected: [],
  withdrawn: [],
};

const NEXT_ACTION: Partial<Record<ApplicationStatus, string>> = {
  interested: "শেষ সময়ের আগে আবেদন করুন",
  applied: "ফি জমা ও প্রবেশপত্রের খোঁজ রাখুন",
  admit_card: "প্রবেশপত্র ডাউনলোড করুন",
  exam: "পরীক্ষার কেন্দ্র দেখে নিন",
  viva: "মূল সনদপত্র সঙ্গে নিন",
};

export async function listApplications(filter: { status?: ApplicationStatus | "all" } = {}): Promise<Result<Application[]>> {
  return read(
    () => {
      const guard = requireSeeker<Application[]>();
      if (guard) return guard;
      const all = structuredClone(getDb().applications);
      return ok(filter.status && filter.status !== "all" ? all.filter((a) => a.status === filter.status) : all);
    },
    { empty: () => [] },
  );
}

export async function createApplication(postId: string, idempotencyKey: string, status: ApplicationStatus = "interested"): Promise<Result<Application>> {
  return mutate(idempotencyKey, () => {
    const guard = requireSeeker<Application>();
    if (guard) return guard;
    const db = getDb();
    const existing = db.applications.find((a) => a.postId === postId);
    if (existing) return ok(structuredClone(existing));
    const c = db.circulars.find((x) => x.posts.some((p) => p.id === postId));
    if (!c) return fail<Application>("NOT_FOUND");
    const post = c.posts.find((p) => p.id === postId)!;
    const id = uid("app");
    const at = nowIso();
    const app: Application = {
      id,
      circularId: c.id,
      circularSlug: c.slug,
      postId,
      jobTitleBn: post.titleBn,
      organizationNameBn: c.organization.nameBn,
      organizationShortName: c.organization.shortName,
      status,
      deadlineAt: c.endAt,
      examAt: null,
      examVenue: null,
      applicantRef: null,
      feePaid: false,
      notes: "",
      nextActionBn: NEXT_ACTION[status] ?? null,
      events: [{ id: uid("evt"), applicationId: id, fromStatus: null, toStatus: status, note: t("tracker.createdEvent"), createdAt: at }],
      createdAt: at,
      updatedAt: at,
      version: 1,
    };
    db.applications.unshift(app);
    return ok(structuredClone(app));
  });
}

export async function updateApplicationStatus(id: string, to: ApplicationStatus, version: number, idempotencyKey: string): Promise<Result<Application>> {
  return mutate(
    idempotencyKey,
    () => {
      const app = getDb().applications.find((a) => a.id === id);
      if (!app) return fail<Application>("NOT_FOUND");
      if (app.version !== version) return fail<Application>("CONFLICT");
      if (app.status === to) return ok(structuredClone(app));
      if (!APPLICATION_TRANSITIONS[app.status].includes(to)) {
        const from = t(`enums.applicationStatus.${app.status}`);
        const allowed = APPLICATION_TRANSITIONS[app.status].map((s) => `‘${t(`enums.applicationStatus.${s}`)}’`).join(", ");
        return fail<Application>("ILLEGAL_TRANSITION", {
          message_bn: allowed
            ? `‘${from}’ থেকে সরাসরি ‘${t(`enums.applicationStatus.${to}`)}’-তে যাওয়া যায় না। পরের ধাপ: ${allowed}`
            : `‘${from}’ চূড়ান্ত অবস্থা — আর বদলানো যায় না।`,
        });
      }
      const at = nowIso();
      app.events.push({ id: uid("evt"), applicationId: id, fromStatus: app.status, toStatus: to, note: null, createdAt: at });
      app.status = to;
      app.nextActionBn = NEXT_ACTION[to] ?? null;
      app.version += 1;
      app.updatedAt = at;
      return ok(structuredClone(app));
    },
    { versioned: true },
  );
}

export async function updateApplication(id: string, patch: ApplicationPatch, version: number, idempotencyKey: string): Promise<Result<Application>> {
  return mutate(
    idempotencyKey,
    () => {
      const app = getDb().applications.find((a) => a.id === id);
      if (!app) return fail<Application>("NOT_FOUND");
      if (app.version !== version) return fail<Application>("CONFLICT");
      Object.assign(app, patch, { version: app.version + 1, updatedAt: nowIso() });
      return ok(structuredClone(app));
    },
    { versioned: true },
  );
}

export async function deleteApplication(id: string, idempotencyKey: string): Promise<Result<{ id: string }>> {
  return mutate(idempotencyKey, () => {
    const db = getDb();
    db.applications = db.applications.filter((a) => a.id !== id);
    return { id };
  });
}

// ───────── notifications ─────────

export async function listNotifications(): Promise<Result<Notification[]>> {
  return read(() => requireSeeker<Notification[]>() ?? ok(structuredClone(getDb().notifications)), { empty: () => [] });
}

export async function markNotificationsRead(ids: string[] | "all"): Promise<Result<{ updated: number }>> {
  return mutate(uid("read"), () => {
    let n = 0;
    for (const x of getDb().notifications) {
      if (!x.readAt && (ids === "all" || ids.includes(x.id))) {
        x.readAt = nowIso();
        n++;
      }
    }
    return { updated: n };
  });
}

// ───────── dashboard ─────────

export async function getSeekerDashboard(): Promise<Result<SeekerDashboard>> {
  return read(() => {
    const guard = requireSeeker<SeekerDashboard>();
    if (guard) return guard;
    const db = getDb();
    const now = Date.now();
    const bm = new Set(db.bookmarks.map((b) => b.postId));
    const p = db.profile;
    const open = db.circulars.filter((c) => c.status === "published" && new Date(c.endAt).getTime() > now);
    const tracked = new Set(db.applications.map((a) => a.circularId));
    const closingThisWeek = open
      .filter((c) => (bm.has(c.posts[0].id) || tracked.has(c.id)) && new Date(c.endAt).getTime() - now <= 7 * DAY)
      .sort((a, b) => a.endAt.localeCompare(b.endAt))
      .map((c) => toListItem(c, bm));
    const recommended = open
      .map((c) => {
        const reasons: string[] = [];
        if (c.districtId && c.districtId === p.homeDistrictId) reasons.push("আপনার জেলা");
        const elig = c.posts.some((post) => computeEligibility(c, post, p, now).verdict === "eligible");
        if (elig) reasons.push("আপনি যোগ্য");
        if (p.preferences.categoryIds.includes(c.categoryId)) reasons.push("পছন্দের বিভাগ");
        if (p.preferences.sectors.includes(c.sector)) reasons.push("পছন্দের খাত");
        return { c, reasons };
      })
      .filter((x) => x.reasons.length >= 2)
      .sort((a, b) => b.reasons.length - a.reasons.length)
      .slice(0, 4)
      .map(({ c, reasons }) => ({ ...toListItem(c, bm), reasonsBn: reasons }));
    const counts = new Map<string, number>();
    for (const a of db.applications) counts.set(a.status, (counts.get(a.status) ?? 0) + 1);
    return ok({
      greetingName: p.fullName.split(" ")[0],
      profileCompleteness: p.completeness,
      missingItems: p.missingItems,
      stats: {
        saved: db.bookmarks.length,
        applied: db.applications.filter((a) => !["interested", "withdrawn"].includes(a.status)).length,
        upcomingExams: db.applications.filter((a) => a.examAt && new Date(a.examAt).getTime() > now).length,
      },
      closingThisWeek,
      upcomingExams: db.applications
        .filter((a) => a.examAt && new Date(a.examAt).getTime() > now)
        .sort((a, b) => a.examAt!.localeCompare(b.examAt!))
        .map((a) => ({ applicationId: a.id, jobTitleBn: a.jobTitleBn, examAt: a.examAt!, venue: a.examVenue })),
      applicationsByStatus: [...counts.entries()].map(([status, count]) => ({
        status,
        labelBn: t(`enums.applicationStatus.${status as ApplicationStatus}`),
        count,
      })),
      recommended,
      savedSearches: structuredClone(db.savedSearches),
    });
  });
}

// ───────── billing ─────────

export async function getBilling(): Promise<Result<Billing>> {
  return read(() => requireSeeker<Billing>() ?? ok(structuredClone(getDb().billing)));
}

function applyPremium(db: ReturnType<typeof getDb>) {
  const premium = db.billing.plans.find((p) => p.id === "premium")!;
  for (const u of db.billing.usage) u.limit = premium.quotas[u.feature];
}

export async function startTrial(idempotencyKey: string): Promise<Result<Billing>> {
  return mutate(idempotencyKey, () => {
    const db = getDb();
    if (db.billing.subscription.trialUsed) return fail<Billing>("DUPLICATE", { message_bn: "ট্রায়াল আগেই ব্যবহার করা হয়েছে" });
    db.billing.subscription = {
      planId: "premium",
      status: "trialing",
      trialEndsAt: new Date(Date.now() + 7 * DAY).toISOString(),
      currentPeriodEnd: new Date(Date.now() + 7 * DAY).toISOString(),
      cancelAtPeriodEnd: false,
      trialUsed: true,
    };
    applyPremium(db);
    return ok(structuredClone(db.billing));
  });
}

export async function completeMockCheckout(outcome: "success" | "fail", idempotencyKey: string): Promise<Result<Billing>> {
  return mutate(idempotencyKey, () => {
    if (outcome === "fail") return fail<Billing>("UNKNOWN", { message_bn: t("billing.failedToast") });
    const db = getDb();
    db.billing.subscription = {
      ...db.billing.subscription,
      planId: "premium",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * DAY).toISOString(),
      cancelAtPeriodEnd: false,
    };
    applyPremium(db);
    return ok(structuredClone(db.billing));
  });
}

export async function setCancelAtPeriodEnd(cancel: boolean, idempotencyKey: string): Promise<Result<Billing>> {
  return mutate(idempotencyKey, () => {
    const db = getDb();
    db.billing.subscription.cancelAtPeriodEnd = cancel;
    return ok(structuredClone(db.billing));
  });
}

// ───────── settings & data ─────────

export async function getSettings(): Promise<Result<Settings>> {
  return read(() => requireSeeker<Settings>() ?? ok(structuredClone(getDb().settings)));
}

export async function saveSettings(patch: Partial<Settings["notifications"]>, version: number, idempotencyKey: string): Promise<Result<Settings>> {
  return mutate(
    idempotencyKey,
    () => {
      const db = getDb();
      if (db.settings.version !== version) return fail<Settings>("CONFLICT");
      db.settings.notifications = { ...db.settings.notifications, ...patch };
      db.settings.version += 1;
      db.settings.updatedAt = nowIso();
      return ok(structuredClone(db.settings));
    },
    { versioned: true },
  );
}

export async function exportMyData(): Promise<Result<{ fileName: string; json: string }>> {
  return read(() => {
    const db = getDb();
    const data = {
      exportedAt: nowIso(),
      profile: db.profile,
      bookmarks: db.bookmarks,
      applications: db.applications,
      resumes: db.resumes,
      savedSearches: db.savedSearches,
      settings: db.settings,
    };
    return { fileName: `chakri-radar-data-${dhakaDateKey(Date.now())}.json`, json: JSON.stringify(data, null, 2) };
  });
}

export async function deleteAccount(confirmation: { text: string; password: string }): Promise<Result<{ deleted: true }>> {
  return mutate(uid("del"), () => {
    if (confirmation.text.trim() !== t("settings.deleteConfirmWord")) return fail<{ deleted: true }>("VALIDATION");
    if (confirmation.password.length < 1) return fail<{ deleted: true }>("UNAUTHENTICATED");
    setRole("guest");
    return { deleted: true as const };
  });
}
