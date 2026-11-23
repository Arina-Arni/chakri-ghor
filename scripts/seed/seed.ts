/**
 * Idempotent seed (spec §8). Every row gets a deterministic id, so re-running updates in
 * place instead of duplicating. Dates are relative to `now`. Exported so integration tests can
 * seed a throwaway database and assert exact dashboard numbers.
 */
import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { dhakaDateKey } from "@/domain/bn";
import { computeAtsScore } from "@/domain/ats";
import { buildCircularSearchText } from "@/domain/search-parser";
import { categories, districtById, districts, divisions, tags } from "@/domain/taxonomy";
import type { ResumeContent } from "@/types";
import type { Db } from "@/server/db/client";
import * as s from "@/server/db/schema";
import { DEFAULT_FLAGS } from "@/server/services/admin-defaults";
import { DEFAULT_PLANS } from "@/server/quota-defaults";
import { WORKFLOW_STEPS } from "@/types";
import { DAY, H, defaultHowTo, seeds as handSeeds, type Seed } from "./circulars-data";
import { generatedSeeds } from "./generated-data";
import { organizationSeeds } from "./organizations-data";

/** Stable UUID from a name (same input → same id on every run). */
export function seedId(name: string): string {
  const h = createHash("sha256").update(`chakri-radar:${name}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

export type DemoUser = { role: "seeker" | "moderator" | "admin"; email: string; fullName: string; password: string };

export type SeedOptions = {
  now: number;
  /** Create (or find) the auth user and return its id. Supabase admin API in real runs. */
  ensureAuthUser: (u: DemoUser) => Promise<string>;
  users: DemoUser[];
  /** Upload the sample notice PDF, returning its storage path (or null when storage is unavailable). */
  uploadSamplePdf?: () => Promise<string | null>;
};

export const ALL_SEEDS: Seed[] = [...handSeeds, ...generatedSeeds];

const DEFAULT_RELAXATIONS = [
  { categoryBn: "বীর মুক্তিযোদ্ধার সন্তান", extraYears: 2 },
  { categoryBn: "শারীরিক প্রতিবন্ধী", extraYears: 2 },
];

export async function seed(db: Db, opts: SeedOptions): Promise<{ circulars: number; posts: number; users: Record<string, string> }> {
  const now = opts.now;

  // ── 3.1 reference data ──
  await db.insert(s.divisions).values(divisions.map((d) => ({ id: d.id, slug: d.slug, nameBn: d.nameBn, nameEn: d.nameEn, aliases: [] }))).onConflictDoUpdate({
    target: s.divisions.id,
    set: { nameBn: sql`excluded.name_bn`, nameEn: sql`excluded.name_en`, slug: sql`excluded.slug` },
  });
  await db
    .insert(s.districts)
    .values(districts.map((d) => ({ id: d.id, slug: d.slug, divisionId: d.divisionId, nameBn: d.nameBn, nameEn: d.nameEn, aliases: [d.nameBn, ...d.aliases] })))
    .onConflictDoUpdate({ target: s.districts.id, set: { nameBn: sql`excluded.name_bn`, nameEn: sql`excluded.name_en`, aliases: sql`excluded.aliases`, divisionId: sql`excluded.division_id` } });
  await db
    .insert(s.categories)
    .values(categories.map((c) => ({ id: c.id, slug: c.slug, nameBn: c.nameBn, nameEn: c.nameEn, icon: c.icon })))
    .onConflictDoUpdate({ target: s.categories.id, set: { nameBn: sql`excluded.name_bn`, nameEn: sql`excluded.name_en`, icon: sql`excluded.icon`, slug: sql`excluded.slug` } });
  await db
    .insert(s.tags)
    .values(tags.map((t) => ({ id: t.id, slug: t.slug, labelBn: t.nameBn, labelEn: t.slug })))
    .onConflictDoUpdate({ target: s.tags.id, set: { labelBn: sql`excluded.label_bn` } });

  // ── demo users (one per role) ──
  const userIds: Record<string, string> = {};
  for (const u of opts.users) {
    const id = await opts.ensureAuthUser(u);
    userIds[u.role] = id;
    await db.insert(s.profiles).values({ userId: id, fullName: u.fullName }).onConflictDoNothing();
    await db.update(s.profiles).set({ role: u.role, status: "active", fullName: u.fullName }).where(eq(s.profiles.userId, id));
    await db.insert(s.notificationPreferences).values({ userId: id }).onConflictDoNothing();
    await db.insert(s.preferences).values({ userId: id }).onConflictDoNothing();
  }
  const adminId = userIds.admin ?? null;
  const modId = userIds.moderator ?? adminId;

  // ── organizations ──
  const orgIdOf = (key: string) => seedId(`org:${key}`);
  for (const o of organizationSeeds) {
    const values = {
      id: orgIdOf(o.id),
      nameBn: o.nameBn,
      nameEn: o.nameEn,
      shortName: o.shortName,
      slug: o.slug,
      type: o.type,
      website: o.website,
      verified: o.verified,
      verifiedAt: o.verified ? new Date(now - 30 * DAY) : null,
      verifiedBy: o.verified ? adminId : null,
      isSample: true,
    };
    await db.insert(s.organizations).values(values).onConflictDoUpdate({ target: s.organizations.id, set: { ...values, id: undefined, deletedAt: null } });
  }
  const orgBy = new Map(organizationSeeds.map((o) => [o.id, o]));

  const pdfPath = opts.uploadSamplePdf ? await opts.uploadSamplePdf() : null;

  // ── circulars & posts ──
  let postCount = 0;
  for (const c of ALL_SEEDS) {
    const org = orgBy.get(c.org);
    if (!org) throw new Error(`Unknown organization ${c.org} in seed ${c.slug}`);
    if (c.district && !districtById.has(c.district)) throw new Error(`Unknown district ${c.district} in seed ${c.slug}`);
    const id = seedId(`circular:${c.slug}`);
    const startAt = new Date(now + c.start);
    const endAt = new Date(now + c.end);
    const base = c.status ?? "published";
    const status: (typeof s.circularStatusEnum.enumValues)[number] = base === "published" && endAt.getTime() <= now ? "closed" : base;
    const posts = c.posts.map((p, i) => ({
      id: seedId(`post:${c.slug}:${i}`),
      circularId: id,
      position: i,
      titleBn: p.titleBn,
      titleEn: p.titleEn,
      vacancies: p.vacancies,
      grade: p.grade ?? null,
      salaryMin: p.salaryMin ?? null,
      salaryMax: p.salaryMax ?? null,
      salaryText: p.salaryText ?? (p.salaryMin == null && p.salaryMax == null ? "উল্লেখ নেই" : null),
      minEducationLevel: p.minEducation ?? "ssc",
      requiredSubjects: p.subjects ?? [],
      experienceYearsMin: p.experienceYears ?? 0,
      ageMin: p.ageMin === undefined ? 18 : p.ageMin,
      ageMax: p.ageMax === undefined ? 30 : p.ageMax,
      ageRelaxations: p.ageRelaxations ?? DEFAULT_RELAXATIONS,
      eligibleDistrictIds: p.eligibleDistrictIds ?? [],
      eligibleDivisionIds: p.eligibleDivisionIds ?? [],
      genderRestriction: p.gender ?? "any",
      otherRequirements: [...(p.otherRequirements ?? []), ...(p.manualChecks ?? [])],
      keywordsEn: p.keywordsRequired ?? [],
      keywordsPreferred: p.keywordsPreferred ?? [],
    }));
    postCount += posts.length;
    const salaries = posts.flatMap((p) => [p.salaryMin, p.salaryMax]).filter((v): v is number => v != null);
    const values = {
      id,
      organizationId: orgIdOf(c.org),
      noticeNo: c.noticeNo,
      titleBn: c.titleBn,
      titleEn: c.titleEn,
      slug: c.slug,
      descriptionBn: `নমুনা তথ্য — ${c.description}`,
      howToApplyBn: c.howTo ?? defaultHowTo(c.platform),
      sector: c.sector,
      jobType: c.jobType ?? "full_time",
      workMode: c.workMode ?? "onsite",
      categoryId: c.category,
      divisionId: c.division ?? (c.district ? (districtById.get(c.district)?.divisionId ?? null) : null),
      districtId: c.district,
      publishedOn: status === "published" || status === "closed" ? dhakaDateKey(now + Math.min(c.start, -6 * H)) : null,
      applicationStartAt: startAt,
      applicationEndAt: endAt,
      originalEndAt: c.extendedBy ? new Date(now + c.end - c.extendedBy) : null,
      ageReferenceDate: dhakaDateKey(new Date(now + c.start)),
      applyUrl:
        c.platform === "teletalk"
          ? `https://${c.slug.split("-")[0]}.teletalk.com.bd`
          : c.platform === "email"
            ? `mailto:jobs@example.com?subject=${encodeURIComponent(c.titleEn)}`
            : `https://example.com/careers/${c.slug}`,
      applyPlatform: c.platform,
      applicationFee: c.fee === undefined ? null : c.fee,
      sourceUrl: `https://example.gov.bd/notices/${c.slug}`,
      pdfPath: c.pdf ? pdfPath : null,
      status,
      reviewNote: status === "rejected" ? "উৎস যাচাই করা যায়নি।" : null,
      submittedBy: modId,
      reviewedBy: status === "published" || status === "closed" || status === "rejected" ? modId : null,
      publishedAt: status === "published" || status === "closed" ? new Date(now + Math.min(c.start, -6 * H) + 2 * H) : null,
      closedAt: status === "closed" ? endAt : null,
      revision: c.extendedBy ? 1 : 0,
      source: "manual" as const,
      aiTags: c.aiTags ?? [],
      totalVacancies: posts.reduce((n, p) => n + p.vacancies, 0),
      maxSalary: salaries.length ? Math.max(...salaries) : null,
      minSalary: salaries.length ? Math.min(...salaries) : null,
      searchText: buildCircularSearchText({
        titleBn: c.titleBn,
        titleEn: c.titleEn,
        noticeNo: c.noticeNo,
        organization: org,
        posts: c.posts.map((p) => ({ titleBn: p.titleBn, titleEn: p.titleEn, keywords: p.keywordsRequired ?? [] })),
        districtId: c.district,
        divisionId: c.division,
        categoryId: c.category,
        tagLabels: (c.tags ?? []).map((slug) => tags.find((t) => t.slug === slug)?.nameBn ?? ""),
        tax: { districts, divisions, categories },
      }),
      isSample: true,
      createdAt: new Date(now + Math.min(c.start, 0) - DAY),
      updatedAt: new Date(now + Math.min(c.start, 0)),
      deletedAt: null,
    };
    await db.insert(s.circulars).values(values).onConflictDoUpdate({ target: s.circulars.id, set: { ...values, id: undefined, version: sql`${s.circulars.version} + 1` } });
    for (const p of posts) {
      await db.insert(s.circularPosts).values(p).onConflictDoUpdate({ target: s.circularPosts.id, set: { ...p, id: undefined } });
    }
    const tagIds = (c.tags ?? []).map((slug) => tags.find((t) => t.slug === slug)?.id).filter((x): x is string => Boolean(x));
    if (tagIds.length) await db.insert(s.circularTags).values(tagIds.map((tagId) => ({ circularId: id, tagId, source: "manual" as const }))).onConflictDoNothing();
    if (c.extendedBy) {
      await db
        .insert(s.circularRevisions)
        .values({
          id: seedId(`revision:${c.slug}:extend`),
          circularId: id,
          snapshot: { before: { endAt: new Date(now + c.end - c.extendedBy).toISOString() }, after: { endAt: endAt.toISOString() } },
          changedFields: ["endAt"],
          critical: true,
          changedBy: modId,
        })
        .onConflictDoNothing();
    }
  }

  const postId = (slug: string, i = 0) => seedId(`post:${slug}:${i}`);
  const circularId = (slug: string) => seedId(`circular:${slug}`);

  // ── demo seeker ──
  const seekerId = userIds.seeker;
  if (seekerId) await seedSeeker(db, seekerId, now, { postId, circularId });

  // Admin & moderator get a completed (minimal) profile so the app doesn't ask them to onboard.
  for (const role of ["admin", "moderator"] as const) {
    const id = userIds[role];
    if (id) await db.update(s.profiles).set({ onboardingStep: 4, onboardingCompletedAt: new Date(now - 60 * DAY) }).where(eq(s.profiles.userId, id));
  }

  // ── plans & feature flags ──
  for (const pl of DEFAULT_PLANS) {
    await db
      .insert(s.plans)
      .values({ code: pl.code, nameBn: pl.nameBn, priceBdt: pl.priceBdt, billingPeriod: pl.billingPeriod, quotas: pl.quotas, featuresBn: pl.featuresBn })
      .onConflictDoNothing();
  }
  for (const [key, enabled] of Object.entries(DEFAULT_FLAGS)) {
    await db.insert(s.featureFlags).values({ key, enabled }).onConflictDoNothing();
  }

  // ── demo workflow runs (succeeded, waiting_review, failed at notify_matches) ──
  if (adminId) await seedWorkflowRuns(db, now, adminId, circularId);

  // ── sample searches (only on an empty log, so re-runs don't inflate analytics) ──
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.searchLogs);
  if (Number(n) === 0) {
    const samples: [string, number, "normal" | "ai_fallback"][] = [
      ["সরকারি চাকরি খুলনা", 6, "ai_fallback"],
      ["সরকারি চাকরি খুলনা", 6, "ai_fallback"],
      ["এইচএসসি পাসে চাকরি", 12, "ai_fallback"],
      ["ব্যাংক জব", 3, "normal"],
      ["ব্যাংক জব", 3, "normal"],
      ["প্রাথমিক শিক্ষক", 2, "normal"],
      ["পাইলট চাকরি সিলেট", 0, "ai_fallback"],
      ["হোটেল ম্যানেজমেন্ট", 0, "normal"],
    ];
    await db.insert(s.searchLogs).values(
      samples.map(([q, resultCount, mode], i) => ({ normalizedQuery: q, parsedFilters: {}, mode, resultCount, createdAt: new Date(now - (i + 1) * H) })),
    );
  }

  return { circulars: ALL_SEEDS.length, posts: postCount, users: userIds };
}

async function seedSeeker(
  db: Db,
  userId: string,
  now: number,
  ids: { postId: (slug: string, i?: number) => string; circularId: (slug: string) => string },
) {
  await db
    .update(s.profiles)
    .set({
      fullName: "রহিমা আক্তার",
      phone: "01712345678",
      dateOfBirth: "1998-04-12",
      gender: "female",
      homeDistrictId: "dis_khulna",
      currentDistrictId: "dis_khulna",
      specialCategories: [],
      headline: "অফিস সহকারী · ৩ বছরের অভিজ্ঞতা",
      summary: "উপজেলা অফিসে নথি ব্যবস্থাপনা, টাইপিং ও ডাটা এন্ট্রির অভিজ্ঞতা। সরকারি অফিস সহকারী পদে আগ্রহী।",
      links: [{ label: "LinkedIn", url: "https://www.linkedin.com/in/example" }],
      onboardingStep: 4,
      onboardingCompletedAt: new Date(now - 40 * DAY),
      aiConsentAt: new Date(now - 40 * DAY),
    })
    .where(eq(s.profiles.userId, userId));

  await db.delete(s.educations).where(eq(s.educations.userId, userId));
  await db.insert(s.educations).values([
    { id: seedId("edu:seeker:ssc"), userId, level: "ssc", degreeName: "এসএসসি", subject: "ব্যবসায় শিক্ষা", institution: "খুলনা জিলা স্কুল", boardOrUniversity: "যশোর", resultText: "4.50", gpa: 4.5, passingYear: 2014, position: 0 },
    { id: seedId("edu:seeker:hsc"), userId, level: "hsc", degreeName: "এইচএসসি", subject: "ব্যবসায় শিক্ষা", institution: "সরকারি মজিদ মেমোরিয়াল সিটি কলেজ", boardOrUniversity: "যশোর", resultText: "4.25", gpa: 4.25, passingYear: 2016, position: 1 },
    { id: seedId("edu:seeker:bba"), userId, level: "bachelor", degreeName: "বিবিএস", subject: "Accounting", institution: "খুলনা বিশ্ববিদ্যালয়", boardOrUniversity: "খুলনা বিশ্ববিদ্যালয়", resultText: "3.40", gpa: 3.4, passingYear: 2021, position: 2 },
  ]);
  await db.delete(s.experiences).where(eq(s.experiences.userId, userId));
  await db.insert(s.experiences).values([
    {
      id: seedId("exp:seeker:1"),
      userId,
      title: "অফিস সহকারী",
      organization: "উপজেলা নির্বাহী অফিসারের কার্যালয়, ডুমুরিয়া",
      startDate: "2023-02-01",
      endDate: null,
      isCurrent: true,
      bullets: ["Typed official letters in Bangla and English", "Maintained file records and registers", "Entered beneficiary data in Microsoft Excel"],
      position: 0,
    },
    {
      id: seedId("exp:seeker:2"),
      userId,
      title: "ডাটা এন্ট্রি অপারেটর (চুক্তিভিত্তিক)",
      organization: "আলোর পথ উন্নয়ন সংস্থা",
      startDate: "2021-07-01",
      endDate: "2022-12-31",
      isCurrent: false,
      bullets: ["Entered survey data for 4,000 households", "Checked data quality with supervisors"],
      position: 1,
    },
  ]);
  await db.delete(s.userSkills).where(eq(s.userSkills.userId, userId));
  const skills = ["Bangla Typing", "Microsoft Office", "Data Entry", "Record Keeping", "Microsoft Excel", "Correspondence"];
  await db.insert(s.userSkills).values(skills.map((skill, i) => ({ userId, skill, position: i })));
  await db
    .insert(s.preferences)
    .values({ userId, categoryIds: ["cat_admin", "cat_bank"], districtIds: ["dis_khulna", "dis_jashore"], sectors: ["government"], jobTypes: ["full_time"], workModes: ["onsite"], minSalary: 15000 })
    .onConflictDoUpdate({
      target: s.preferences.userId,
      set: { categoryIds: ["cat_admin", "cat_bank"], districtIds: ["dis_khulna", "dis_jashore"], sectors: ["government"], jobTypes: ["full_time"], workModes: ["onsite"], minSalary: 15000 },
    });

  // Bookmarks
  const bookmarkSlugs = ["dc-khulna-office-assistant-2026", "railway-khalashi-2026", "bsc-senior-officer-2026", "meghna-cash-officer", "dc-rajshahi-office-sohayok-2026"];
  const existingPosts = await db
    .select({ id: s.circularPosts.id })
    .from(s.circularPosts)
    .where(inArray(s.circularPosts.id, bookmarkSlugs.map((x) => ids.postId(x))));
  for (const p of existingPosts) await db.insert(s.bookmarks).values({ userId, circularPostId: p.id }).onConflictDoNothing();

  // Applications in different statuses, each with its event history.
  type Plan = { slug: string; i?: number; status: (typeof s.applicationStatusEnum.enumValues)[number]; path: (typeof s.applicationStatusEnum.enumValues)[number][]; examInDays?: number };
  const plans: Plan[] = [
    { slug: "dc-khulna-office-assistant-2026", status: "preparing", path: ["saved", "preparing"] },
    { slug: "bsc-senior-officer-2026", status: "applied", path: ["saved", "applied"] },
    { slug: "dpe-assistant-teacher-2026", status: "admit_card", path: ["saved", "applied", "admit_card"] },
    { slug: "dghs-medical-technologist-2026", status: "exam_scheduled", path: ["saved", "applied", "admit_card", "exam_scheduled"], examInDays: 5 },
    { slug: "railway-khalashi-2026", status: "saved", path: ["saved"] },
    { slug: "mmch-ward-boy-ayah", status: "rejected", path: ["saved", "applied", "rejected"] },
  ];
  for (const [k, plan] of plans.entries()) {
    const post = ids.postId(plan.slug, plan.i ?? 0);
    const [exists] = await db.select({ id: s.circularPosts.id }).from(s.circularPosts).where(eq(s.circularPosts.id, post));
    if (!exists) continue;
    const id = seedId(`application:${plan.slug}`);
    const created = now - (20 - k) * DAY;
    const values = {
      id,
      userId,
      circularPostId: post,
      status: plan.status,
      applicantRef: plan.path.includes("applied") ? `TT${100000 + k * 731}` : null,
      feePaid: plan.path.includes("applied"),
      appliedAt: plan.path.includes("applied") ? new Date(created + 2 * DAY) : null,
      examAt: plan.examInDays ? new Date(now + plan.examInDays * DAY + 4 * H) : null,
      examVenue: plan.examInDays ? "খুলনা জিলা স্কুল কেন্দ্র" : null,
      notes: "",
      createdAt: new Date(created),
      updatedAt: new Date(created + plan.path.length * DAY),
    };
    await db.insert(s.applications).values(values).onConflictDoUpdate({ target: s.applications.id, set: { ...values, id: undefined } });
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.applicationEvents).where(eq(s.applicationEvents.applicationId, id));
    if (Number(n) === 0) {
      await db.insert(s.applicationEvents).values(
        plan.path.map((to, i) => ({
          applicationId: id,
          fromStatus: i === 0 ? null : plan.path[i - 1],
          toStatus: to,
          actorId: userId,
          note: i === 0 ? "ট্র্যাকারে যোগ করা হয়েছে" : null,
          createdAt: new Date(created + i * DAY),
        })),
      );
    }
  }

  // Saved searches
  const searches = [
    { id: seedId("search:khulna-govt"), name: "খুলনায় সরকারি অফিস সহকারী", filters: { district: ["dis_khulna"], sector: ["government" as const], category: ["cat_admin"] } },
    { id: seedId("search:bank"), name: "ব্যাংকের চাকরি", filters: { category: ["cat_bank"] } },
  ];
  for (const x of searches) {
    await db
      .insert(s.savedSearches)
      .values({ ...x, userId, alertEnabled: true, lastNotifiedAt: new Date(now - 3 * DAY), createdAt: new Date(now - 15 * DAY) })
      .onConflictDoUpdate({ target: s.savedSearches.id, set: { name: x.name, filters: x.filters, lastNotifiedAt: new Date(now - 3 * DAY) } });
  }

  // Resumes: base + one tailored
  const base: ResumeContent = {
    contact: { fullName: "Rahima Akter", email: "seeker.demo@chakri-radar.app", phone: "01712345678", location: "Khulna, Bangladesh", links: ["https://www.linkedin.com/in/example"] },
    headline: "Office Assistant · 3 years of experience",
    summary: "Office assistant with three years of experience in records management, Bangla and English typing and data entry at an upazila office.",
    skills: ["Bangla Typing", "Microsoft Office", "Data Entry", "Record Keeping", "Microsoft Excel", "Correspondence"],
    experience: [
      { id: "x1", title: "Office Assistant", organization: "Upazila Nirbahi Officer's Office, Dumuria", location: "Khulna", startDate: "Feb 2023", endDate: "Present", bullets: ["Typed official letters in Bangla and English", "Maintained file records and registers", "Entered beneficiary data in Microsoft Excel"] },
      { id: "x2", title: "Data Entry Operator (contract)", organization: "Alor Poth Unnayan Sangstha", location: "Khulna", startDate: "Jul 2021", endDate: "Dec 2022", bullets: ["Entered survey data for 4,000 households", "Checked data quality with supervisors"] },
    ],
    education: [
      { id: "e1", degree: "BBS, Accounting", institution: "Khulna University", year: "2021", result: "3.40" },
      { id: "e2", degree: "HSC, Business Studies", institution: "Govt. M. M. City College", year: "2016", result: "4.25" },
    ],
    certifications: ["Computer Office Application (6 months), BTEB"],
    languages: ["Bangla", "English"],
  };
  const baseScore = computeAtsScore(base, { required: [], preferred: [] });
  const baseValues = { id: seedId("resume:base"), userId, circularPostId: null, title: "Base resume", content: base, atsScore: baseScore.score, matchedKeywords: [], missingKeywords: [] };
  const [existingBase] = await db.select({ id: s.resumes.id }).from(s.resumes).where(and(eq(s.resumes.userId, userId), sql`${s.resumes.circularPostId} is null`));
  if (!existingBase) await db.insert(s.resumes).values(baseValues);
  else await db.update(s.resumes).set({ content: base, atsScore: baseScore.score }).where(eq(s.resumes.id, existingBase.id));

  const tailoredPost = ids.postId("dc-khulna-office-assistant-2026", 0);
  const [tp] = await db.select().from(s.circularPosts).where(eq(s.circularPosts.id, tailoredPost));
  if (tp) {
    const score = computeAtsScore(base, { required: tp.keywordsEn, preferred: tp.keywordsPreferred });
    const values = {
      id: seedId("resume:tailored:dc-khulna"),
      userId,
      circularPostId: tailoredPost,
      title: tp.titleEn,
      content: base,
      atsScore: score.score,
      matchedKeywords: score.matched,
      missingKeywords: score.missing,
      aiChanges: [],
    };
    await db.insert(s.resumes).values(values).onConflictDoUpdate({ target: s.resumes.id, set: { content: base, atsScore: score.score, matchedKeywords: score.matched, missingKeywords: score.missing } });
  }

  // Notifications (dedupe keys keep re-runs from duplicating)
  const notes = [
    { key: "seed:deadline:dc-khulna", type: "deadline" as const, title: "আজ শেষ: অফিস সহকারী, খুলনা", body: "জেলা প্রশাসকের কার্যালয়, খুলনা — আবেদনের সময় আর কয়েক ঘণ্টা।", link: "/jobs/dc-khulna-office-assistant-2026", at: now - 2 * H, read: false },
    { key: "seed:extend:railway", type: "deadline" as const, title: "সময় বৃদ্ধি হয়েছে", body: "বাংলাদেশ রেলওয়ে — খালাসি পদের আবেদনের সময় বাড়ানো হয়েছে।", link: "/jobs/railway-khalashi-2026", at: now - 26 * H, read: false },
    { key: "seed:exam:dghs", type: "exam" as const, title: "পরীক্ষার তারিখ ঘনিয়ে আসছে", body: "মেডিকেল টেকনোলজিস্ট — ৫ দিন পর লিখিত পরীক্ষা।", link: "/applications", at: now - 3 * DAY, read: true },
    { key: "seed:match:bank", type: "new_match" as const, title: "নতুন মিল: ব্যাংকের চাকরি", body: "আপনার সেভ করা সার্চে ২টি নতুন সার্কুলার।", link: "/alerts", at: now - 4 * DAY, read: true },
  ];
  for (const x of notes) {
    await db
      .insert(s.notifications)
      .values({ userId, type: x.type, title: x.title, body: x.body, link: x.link, dedupeKey: `${x.key}:${userId}`, readAt: x.read ? new Date(x.at + H) : null, createdAt: new Date(x.at) })
      .onConflictDoNothing({ target: s.notifications.dedupeKey });
  }
  await db.insert(s.subscriptions).values({ userId }).onConflictDoNothing();
}

/** Three demo runs so the judges can open a timeline and press "Retry" right away. */
async function seedWorkflowRuns(db: Db, now: number, adminId: string, circularId: (slug: string) => string) {
  const plans: { key: string; label: string; circular: string; status: "succeeded" | "waiting_review" | "failed"; until: string; startedMinsAgo: number }[] = [
    { key: "demo-succeeded", label: "সমাজসেবা অধিদপ্তর — নমুনা ইনজেস্ট", circular: "alor-poth-community-mobiliser", status: "succeeded", until: "notify_matches", startedMinsAgo: 180 },
    { key: "demo-waiting", label: "পরিসংখ্যান ব্যুরো — গণনাকারী (নমুনা)", circular: "review-bbs-enumerator", status: "waiting_review", until: "review_gate", startedMinsAgo: 90 },
    { key: "demo-failed", label: "স্বাস্থ্য অধিদপ্তর — নমুনা (notify ব্যর্থ)", circular: "dghs-medical-technologist-2026", status: "failed", until: "notify_matches", startedMinsAgo: 30 },
  ];
  for (const p of plans) {
    const runId = seedId(`run:${p.key}`);
    const cid = circularId(p.circular);
    const [exists] = await db.select({ id: s.workflowRuns.id }).from(s.workflowRuns).where(eq(s.workflowRuns.id, runId));
    if (exists) continue;
    const [c] = await db.select({ id: s.circulars.id }).from(s.circulars).where(eq(s.circulars.id, cid));
    if (!c) continue;
    const start = now - p.startedMinsAgo * 60_000;
    await db.insert(s.workflowRuns).values({
      id: runId,
      type: "circular_ingest",
      status: p.status,
      input: { kind: "text", label: p.label, sha256: seedId(`sha:${p.key}`).replace(/-/g, ""), size: 400, text: `${p.label}\nনমুনা ইনজেস্ট টেক্সট — শুধু ডেমোর জন্য।`, failAt: p.status === "failed" ? "notify_matches" : null },
      context: {},
      idempotencyKey: `ingest:demo:${p.key}`,
      circularId: cid,
      createdBy: adminId,
      startedAt: new Date(start),
      finishedAt: p.status === "waiting_review" ? null : new Date(start + 60_000),
      error: p.status === "failed" ? "notify_matches: INJECTED_FAILURE" : null,
    });
    const untilIdx = WORKFLOW_STEPS.indexOf(p.until as (typeof WORKFLOW_STEPS)[number]);
    for (const [i, name] of WORKFLOW_STEPS.entries()) {
      const isLast = i === untilIdx;
      const status =
        name === "apply_update" ? "skipped" : i < untilIdx ? "succeeded" : isLast ? (p.status === "succeeded" ? "succeeded" : p.status === "waiting_review" ? "waiting" : "failed") : "pending";
      const output: Record<string, unknown> | null =
        status === "skipped"
          ? { skippedReason: "branch" }
          : name === "create_draft"
            ? { circularId: cid, status: "pending_review" }
            : name === "review_gate" && status === "waiting"
              ? { reasons: ["confidence 0.74 < 0.85"] }
              : name === "notify_matches" && status === "succeeded"
                ? { cursor: null, notified: 0, batches: 1, done: true }
                : status === "succeeded"
                  ? { ok: true, demo: true }
                  : null;
      await db.insert(s.workflowSteps).values({
        runId,
        name,
        position: i,
        status,
        attempts: status === "pending" ? 0 : status === "failed" ? 3 : 1,
        maxAttempts: name === "review_gate" ? 1 : 3,
        output,
        errorCode: status === "failed" ? "INJECTED_FAILURE" : null,
        errorMessage: status === "failed" ? "পরীক্ষার জন্য ইচ্ছাকৃত ব্যর্থতা (failAt)" : null,
        startedAt: status === "pending" ? null : new Date(start + i * 4000),
        finishedAt: status === "succeeded" || status === "failed" || status === "skipped" ? new Date(start + i * 4000 + 2500) : null,
      });
    }
    await db.insert(s.workflowEvents).values({ runId, type: "run.created", toStatus: "queued", actorId: adminId, message: "seed demo" });
  }
}