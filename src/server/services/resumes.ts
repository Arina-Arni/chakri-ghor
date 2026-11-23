import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { computeAtsScore, keywordCoverage } from "@/domain/ats";
import { districtById } from "@/domain/taxonomy";
import type { Profile, Resume, ResumeChange, ResumeContent, ResumeListItem, TailorResult } from "@/types";
import { requireUser } from "@/server/authz";
import type { Ctx } from "@/server/context";
import type { DbOrTx, Tx } from "@/server/db/client";
import { circularPosts, circulars, resumeVersions, resumes } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { t } from "@/i18n";
import { aiTailorChanges } from "@/server/ai/features";
import { consumeQuota } from "@/server/quota";
import { loadProfile } from "./profile";

type ResumeRow = typeof resumes.$inferSelect;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthYear = (iso: string | null) => (iso ? `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : "Present");

const LEVEL_EN: Record<string, string> = {
  class_8: "Junior School Certificate",
  ssc: "SSC",
  hsc: "HSC",
  diploma: "Diploma",
  bachelor: "Bachelor's",
  masters: "Master's",
  phd: "PhD",
};

/** The English base resume, built from the profile. */
export function resumeFromProfile(p: Profile): ResumeContent {
  const location = p.currentDistrictId ? (districtById.get(p.currentDistrictId)?.nameEn ?? "") : "";
  return {
    contact: {
      fullName: p.fullName,
      email: p.email,
      phone: p.phone ?? "",
      location: location ? `${location}, Bangladesh` : "Bangladesh",
      links: p.links.map((l) => l.url).filter(Boolean).slice(0, 5),
    },
    headline: p.headline,
    summary: p.summary,
    skills: p.skills.slice(0, 40),
    experience: p.experiences.slice(0, 10).map((e) => ({
      id: e.id,
      title: e.title,
      organization: e.organization,
      location: "",
      startDate: monthYear(e.startDate),
      endDate: e.current ? "Present" : monthYear(e.endDate),
      bullets: e.bullets.slice(0, 10),
    })),
    education: p.educations.slice(0, 8).map((e) => ({
      id: e.id,
      degree: [e.degreeName || LEVEL_EN[e.level], e.subject].filter(Boolean).join(", "),
      institution: e.institution,
      year: String(e.passingYear),
      result: e.result,
    })),
    certifications: [],
    languages: ["Bangla", "English"],
  };
}

type PostMeta = { postId: string; circularId: string; slug: string; titleBn: string; required: string[]; preferred: string[] };

async function postMeta(db: DbOrTx, postIds: string[]): Promise<Map<string, PostMeta>> {
  if (postIds.length === 0) return new Map();
  const rows = await db
    .select({
      postId: circularPosts.id,
      circularId: circulars.id,
      slug: circulars.slug,
      titleBn: circularPosts.titleBn,
      required: circularPosts.keywordsEn,
      preferred: circularPosts.keywordsPreferred,
    })
    .from(circularPosts)
    .innerJoin(circulars, eq(circulars.id, circularPosts.circularId))
    .where(inArray(circularPosts.id, postIds));
  return new Map(rows.map((r) => [r.postId, r]));
}

async function toResume(db: DbOrTx, r: ResumeRow): Promise<Resume> {
  const [meta, versions] = await Promise.all([
    postMeta(db, r.circularPostId ? [r.circularPostId] : []),
    db.select().from(resumeVersions).where(eq(resumeVersions.resumeId, r.id)).orderBy(desc(resumeVersions.createdAt)).limit(30),
  ]);
  const m = r.circularPostId ? meta.get(r.circularPostId) : undefined;
  return {
    id: r.id,
    kind: r.circularPostId ? "tailored" : "base",
    title: r.title,
    circularId: m?.circularId ?? null,
    circularSlug: m?.slug ?? null,
    postId: r.circularPostId,
    jobTitleBn: m?.titleBn ?? null,
    content: r.content,
    keywordsRequired: m?.required ?? [],
    keywordsPreferred: m?.preferred ?? [],
    atsScore: r.atsScore,
    changes: r.aiChanges,
    aiSummaryBn: r.aiSummaryBn,
    versions: versions.map((v) => ({ id: v.id, resumeId: v.resumeId, version: v.version, labelBn: v.labelBn, createdAt: v.createdAt.toISOString(), content: v.content })),
    version: r.version,
    updatedAt: r.updatedAt.toISOString(),
  };
}

function score(content: ResumeContent, required: string[], preferred: string[]) {
  const ats = computeAtsScore(content, { required, preferred });
  return { atsScore: ats.score, matchedKeywords: ats.matched, missingKeywords: ats.missing };
}

async function ownResume(ctx: Ctx, db: DbOrTx, id: string, mutation = false): Promise<ResumeRow> {
  const userId = requireUser(ctx.actor, "seeker.own", { mutation });
  const [row] = await db.select().from(resumes).where(eq(resumes.id, id));
  if (!row || row.userId !== userId) throw new AppError("NOT_FOUND");
  return row;
}

async function ensureBase(ctx: Ctx, db: DbOrTx, userId: string): Promise<void> {
  const [base] = await db.select({ id: resumes.id }).from(resumes).where(and(eq(resumes.userId, userId), isNull(resumes.circularPostId)));
  if (base) return;
  const profile = await loadProfile(db, userId, ctx.actor.kind === "user" ? ctx.actor.email : "");
  if (!profile.onboardingCompleted) return;
  const content = resumeFromProfile(profile);
  await db
    .insert(resumes)
    .values({ userId, title: profile.headline || "Base resume", content, ...score(content, [], []) })
    .onConflictDoNothing();
}

export async function listResumes(ctx: Ctx, db: DbOrTx): Promise<ResumeListItem[]> {
  const userId = requireUser(ctx.actor);
  await ensureBase(ctx, db, userId);
  const rows = await db.select().from(resumes).where(eq(resumes.userId, userId)).orderBy(sql`${resumes.circularPostId} is not null`, desc(resumes.updatedAt));
  const meta = await postMeta(db, rows.map((r) => r.circularPostId).filter((x): x is string => Boolean(x)));
  return rows.map((r) => {
    const m = r.circularPostId ? meta.get(r.circularPostId) : undefined;
    return {
      id: r.id,
      kind: r.circularPostId ? "tailored" : "base",
      title: r.title,
      jobTitleBn: m?.titleBn ?? null,
      atsScore: r.atsScore,
      updatedAt: r.updatedAt.toISOString(),
      circularSlug: m?.slug ?? null,
    };
  });
}

export async function getResume(ctx: Ctx, db: DbOrTx, id: string): Promise<Resume> {
  return toResume(db, await ownResume(ctx, db, id));
}

/** Save with optimistic locking; the previous content goes to resume_versions. */
async function writeContent(ctx: Ctx, tx: Tx, row: ResumeRow, content: ResumeContent, version: number, label: string, extra: Partial<typeof resumes.$inferInsert> = {}): Promise<ResumeRow> {
  const meta = row.circularPostId ? (await postMeta(tx, [row.circularPostId])).get(row.circularPostId) : undefined;
  const [updated] = await tx
    .update(resumes)
    .set({ content, ...score(content, meta?.required ?? [], meta?.preferred ?? []), ...extra, version: sql`${resumes.version} + 1`, updatedAt: new Date(ctx.now()) })
    .where(and(eq(resumes.id, row.id), eq(resumes.version, version)))
    .returning();
  if (!updated) throw new AppError("CONFLICT");
  await tx.insert(resumeVersions).values({ resumeId: row.id, version: row.version, labelBn: label, content: row.content });
  return updated;
}

export async function saveResume(ctx: Ctx, tx: Tx, id: string, content: ResumeContent, version: number): Promise<Resume> {
  const row = await ownResume(ctx, tx, id, true);
  if (row.version !== version) throw new AppError("CONFLICT");
  return toResume(tx, await writeContent(ctx, tx, row, content, version, "সংরক্ষণের আগের লেখা"));
}

function changeId(): string {
  return `chg_${[...crypto.getRandomValues(new Uint8Array(5))].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function overlap(text: string, keywords: string[]): number {
  return keywordCoverage([text], keywords).matched.length;
}

/**
 * Template tailoring (no AI yet, spec §5.4): order skills and experience bullets by keyword
 * overlap with the post. Reordering never invents facts, so it is applied directly; missing
 * keywords are offered as a pending suggestion to accept only if true.
 */
export function tailorContent(content: ResumeContent, required: string[], preferred: string[]): { content: ResumeContent; changes: ResumeChange[] } {
  const all = [...required, ...preferred];
  const rank = (s: string) => overlap(s, required) * 2 + overlap(s, preferred);
  const stable = <T,>(items: T[], key: (t: T) => number) =>
    items.map((v, i) => ({ v, i, k: key(v) })).sort((a, b) => b.k - a.k || a.i - b.i).map((x) => x.v);
  const next: ResumeContent = structuredClone(content);
  next.skills = stable(content.skills, rank);
  next.experience = content.experience.map((e) => ({ ...e, bullets: stable(e.bullets, rank) }));
  const changes: ResumeChange[] = [];
  if (next.skills.join("|") !== content.skills.join("|")) {
    changes.push({
      id: changeId(),
      section: "skills",
      path: "skills",
      before: content.skills.join(", "),
      after: next.skills.join(", "),
      reasonBn: "সার্কুলারের কিওয়ার্ডের সাথে মেলা দক্ষতাগুলো আগে আনা হয়েছে",
      status: "accepted",
    });
  }
  const missing = computeAtsScore(next, { required, preferred: [] }).missing;
  if (missing.length > 0 && all.length > 0) {
    changes.push({
      id: changeId(),
      section: "skills",
      path: "skills",
      before: next.skills.join(", "),
      after: [...next.skills, ...missing.slice(0, 3)].join(", "),
      reasonBn: "সার্কুলারের আবশ্যক কিওয়ার্ড যোগ করার পরামর্শ — শুধু সত্য হলে গ্রহণ করুন",
      status: "pending",
    });
  }
  return { content: next, changes };
}

/** Create (or refresh) a resume tailored to a post, from the source resume (usually the base). */
export type TailorPlan = {
  sourceId: string;
  postId: string;
  content: ResumeContent;
  changes: ResumeChange[];
  mode: "ai" | "fallback";
  baseVersion: number | null;
};

/**
 * Step 1 (outside any transaction): quota, deterministic reorder and the AI rewrite. The AI
 * call can take up to 25 s, so no rows are locked while it runs.
 */
export async function prepareTailor(ctx: Ctx, db: DbOrTx, sourceId: string, postId: string): Promise<TailorPlan> {
  const userId = requireUser(ctx.actor, "seeker.own", { mutation: true });
  const source = await ownResume(ctx, db, sourceId, true);
  const meta = (await postMeta(db, [postId])).get(postId);
  if (!meta) throw new AppError("NOT_FOUND");
  await consumeQuota(ctx, db, "resume_tailor");
  const [target] = await db.select().from(resumes).where(and(eq(resumes.userId, userId), eq(resumes.circularPostId, postId)));
  const base = target ? target.content : source.content;
  const template = tailorContent(base, meta.required, meta.preferred);
  // AI rewrite (A06) on top of the deterministic reorder; the guard compares against the source resume.
  const aiPart = await aiTailorChanges(ctx, template.content, { required: meta.required, preferred: meta.preferred }, JSON.stringify(source.content));
  return { sourceId, postId, content: template.content, changes: [...template.changes, ...aiPart.changes], mode: aiPart.mode, baseVersion: target?.version ?? null };
}

/** Step 2 (inside the idempotent transaction): write the tailored resume. */
export async function tailorResume(ctx: Ctx, tx: Tx, sourceId: string, postId: string, plan?: TailorPlan): Promise<TailorResult> {
  const userId = requireUser(ctx.actor, "seeker.own", { mutation: true });
  const p = plan ?? (await prepareTailor(ctx, tx, sourceId, postId));
  await ownResume(ctx, tx, sourceId, true);
  const meta = (await postMeta(tx, [postId])).get(postId);
  if (!meta) throw new AppError("NOT_FOUND");
  const [post] = await tx.select({ titleEn: circularPosts.titleEn, titleBn: circularPosts.titleBn }).from(circularPosts).where(eq(circularPosts.id, postId));
  const aiCount = p.changes.filter((c) => c.status === "pending" && c.section !== "skills").length;
  const aiSummaryBn = p.mode === "ai" ? t("resume.aiSummary", { n: aiCount }) : null;
  let [target] = await tx.select().from(resumes).where(and(eq(resumes.userId, userId), eq(resumes.circularPostId, postId)));
  if (!target) {
    [target] = await tx
      .insert(resumes)
      .values({ userId, circularPostId: postId, title: post.titleEn || post.titleBn, content: p.content, aiChanges: p.changes, aiSummaryBn, ...score(p.content, meta.required, meta.preferred) })
      .returning();
  } else {
    if (p.baseVersion != null && target.version !== p.baseVersion) throw new AppError("CONFLICT");
    const kept = target.aiChanges.filter((c) => c.status !== "pending");
    target = await writeContent(ctx, tx, target, p.content, target.version, "টেইলর করার আগের লেখা", { aiChanges: [...kept, ...p.changes], aiSummaryBn });
  }
  return { resume: await toResume(tx, target), mode: p.mode };
}

function setPath(content: ResumeContent, path: string, value: string): ResumeContent {
  const next = structuredClone(content);
  if (path === "skills") {
    next.skills = value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 40);
    return next;
  }
  const parts = path.split(".");
  let node: unknown = next;
  for (let i = 0; i < parts.length - 1; i++) {
    node = (node as Record<string, unknown>)?.[parts[i]];
    if (node == null || typeof node !== "object") throw new AppError("VALIDATION");
  }
  const last = parts[parts.length - 1];
  if (typeof (node as Record<string, unknown>)[last] !== "string") throw new AppError("VALIDATION");
  (node as Record<string, unknown>)[last] = value;
  return next;
}

export async function decideResumeChange(ctx: Ctx, tx: Tx, id: string, changeIdValue: string, accept: boolean): Promise<Resume> {
  const row = await ownResume(ctx, tx, id, true);
  const change = row.aiChanges.find((c) => c.id === changeIdValue);
  if (!change) throw new AppError("NOT_FOUND");
  if (change.status !== "pending") return toResume(tx, row);
  const changes = row.aiChanges.map((c) => (c.id === changeIdValue ? { ...c, status: accept ? ("accepted" as const) : ("rejected" as const) } : c));
  if (!accept) {
    const [updated] = await tx
      .update(resumes)
      .set({ aiChanges: changes, version: sql`${resumes.version} + 1`, updatedAt: new Date(ctx.now()) })
      .where(and(eq(resumes.id, id), eq(resumes.version, row.version)))
      .returning();
    if (!updated) throw new AppError("CONFLICT");
    return toResume(tx, updated);
  }
  const content = setPath(row.content, change.path, change.after);
  return toResume(tx, await writeContent(ctx, tx, row, content, row.version, "পরামর্শ গ্রহণের আগের লেখা", { aiChanges: changes }));
}

export async function restoreResumeVersion(ctx: Ctx, tx: Tx, id: string, versionId: string): Promise<Resume> {
  const row = await ownResume(ctx, tx, id, true);
  const [v] = await tx.select().from(resumeVersions).where(and(eq(resumeVersions.id, versionId), eq(resumeVersions.resumeId, id)));
  if (!v) throw new AppError("NOT_FOUND");
  return toResume(tx, await writeContent(ctx, tx, row, v.content, row.version, "পুনরুদ্ধারের আগের লেখা"));
}

/** For the PDF endpoint. */
export async function resumeForPdf(ctx: Ctx, db: DbOrTx, id: string): Promise<{ title: string; content: ResumeContent }> {
  const row = await ownResume(ctx, db, id);
  return { title: row.title, content: row.content };
}
