// TEMP — replaced by the real implementation in Part 2
import { computeAtsScore } from "@/domain/ats";
import { translateKeyword } from "@/domain/ats";
import { t } from "@/i18n";
import type { Resume, ResumeChange, ResumeContent, ResumeListItem, Result, TailorResult } from "@/types";
import { ai, fail, mutate, nowIso, ok, read, uid } from "./_runtime";
import { getRole } from "./session";
import { getDb } from "./fixtures/db";

function guard<T>(): Result<T> | null {
  return getRole() === "guest" ? fail("UNAUTHENTICATED") : null;
}

function rescore(r: Resume) {
  r.atsScore = computeAtsScore(r.content, { required: r.keywordsRequired, preferred: r.keywordsPreferred }).score;
}

export async function listResumes(): Promise<Result<ResumeListItem[]>> {
  return read(
    () =>
      guard<ResumeListItem[]>() ??
      ok(
        getDb().resumes.map((r) => ({
          id: r.id,
          kind: r.kind,
          title: r.title,
          jobTitleBn: r.jobTitleBn,
          atsScore: r.atsScore,
          updatedAt: r.updatedAt,
          circularSlug: r.circularSlug,
        })),
      ),
    { empty: () => [] },
  );
}

export async function getResume(id: string): Promise<Result<Resume>> {
  return read(() => {
    const g = guard<Resume>();
    if (g) return g;
    const r = getDb().resumes.find((x) => x.id === id);
    return r ? ok(structuredClone(r)) : fail<Resume>("NOT_FOUND");
  });
}

export async function saveResume(id: string, content: ResumeContent, version: number, idempotencyKey: string): Promise<Result<Resume>> {
  return mutate(
    idempotencyKey,
    () => {
      const r = getDb().resumes.find((x) => x.id === id);
      if (!r) return fail<Resume>("NOT_FOUND");
      if (r.version !== version) return fail<Resume>("CONFLICT");
      r.content = structuredClone(content);
      r.version += 1;
      r.updatedAt = nowIso();
      rescore(r);
      return ok(structuredClone(r));
    },
    { versioned: true },
  );
}

/** Keyword-based suggestions used when the AI path is unavailable. */
function fallbackChanges(r: Resume): ResumeChange[] {
  const missing = computeAtsScore(r.content, { required: r.keywordsRequired, preferred: r.keywordsPreferred }).missing;
  if (missing.length === 0) return [];
  return [
    {
      id: uid("chg"),
      section: "skills",
      path: "skills",
      before: r.content.skills.join(", "),
      after: [...r.content.skills, ...missing.slice(0, 3)].join(", "),
      reasonBn: "সার্কুলারের কিওয়ার্ড যোগ করার পরামর্শ — শুধু সত্য হলে গ্রহণ করুন",
      status: "pending",
    },
  ];
}

function aiChanges(r: Resume): ResumeChange[] {
  const kw = r.keywordsRequired.map(translateKeyword);
  const changes: ResumeChange[] = [
    {
      id: uid("chg"),
      section: "summary",
      path: "summary",
      before: r.content.summary,
      after: `${r.content.summary.replace(/\.$/, "")}, with hands-on use of ${kw.slice(0, 3).join(", ") || "office software"}.`,
      reasonBn: "সার্কুলারের আবশ্যক কিওয়ার্ড সারাংশে আনা হয়েছে",
      status: "pending",
    },
  ];
  const firstBullet = r.content.experience[0]?.bullets[0];
  if (firstBullet) {
    changes.push({
      id: uid("chg"),
      section: "experience",
      path: "experience.0.bullets.0",
      before: firstBullet,
      after: `${firstBullet} using ${kw[0] ?? "Microsoft Office"}`,
      reasonBn: "অভিজ্ঞতার পয়েন্টে কিওয়ার্ড যোগ — শুধু সত্য হলে গ্রহণ করুন",
      status: "pending",
    });
  }
  changes.push(...fallbackChanges(r));
  return changes;
}

/**
 * Create (or refresh) a resume tailored to a post. `id` is the source resume, usually the base.
 * Returns the tailored resume with pending changes and whether AI or the fallback produced them.
 */
export async function tailorResume(id: string, postId: string, idempotencyKey: string): Promise<Result<TailorResult>> {
  const g = guard<TailorResult>();
  if (g) return g;
  const db = getDb();
  const usage = db.billing.usage.find((u) => u.feature === "resume_tailor")!;
  const quota = (): Result<TailorResult> =>
    fail("QUOTA_EXCEEDED", {
      retryAfterSec: Math.max(60, Math.round((new Date(usage.resetsAt).getTime() - Date.now()) / 1000)),
      fields: { used: String(usage.used), limit: String(usage.limit), resetsAt: usage.resetsAt },
    });
  void idempotencyKey;
  return ai<TailorResult>(
    (mode) => {
      const source = db.resumes.find((r) => r.id === id);
      const c = db.circulars.find((x) => x.posts.some((p) => p.id === postId));
      if (!source || !c) return fail<TailorResult>("NOT_FOUND");
      const post = c.posts.find((p) => p.id === postId)!;
      let target = db.resumes.find((r) => r.postId === postId);
      if (!target) {
        target = {
          ...structuredClone(source),
          id: uid("res"),
          kind: "tailored",
          title: post.titleEn,
          circularId: c.id,
          circularSlug: c.slug,
          postId,
          jobTitleBn: post.titleBn,
          keywordsRequired: post.keywordsRequired,
          keywordsPreferred: post.keywordsPreferred,
          changes: [],
          aiSummaryBn: null,
          versions: [],
          version: 1,
          updatedAt: nowIso(),
        };
        db.resumes.push(target);
      }
      if (usage.used >= usage.limit && mode === "ai") return quota();
      if (mode === "ai") usage.used++;
      // Breaker open in fixtures for resume_tailor → also fall back when AI is "busy".
      const changes = mode === "ai" ? aiChanges(target) : fallbackChanges(target);
      target.changes = [...target.changes.filter((x) => x.status !== "pending"), ...changes];
      target.aiSummaryBn = mode === "ai" ? t("resume.aiSummary", { n: changes.length }) : null;
      rescore(target);
      return ok({ resume: structuredClone(target), mode });
    },
    { quota },
  );
}

function setPath(content: ResumeContent, path: string, value: string) {
  if (path === "skills") {
    content.skills = value.split(",").map((s) => s.trim()).filter(Boolean);
    return;
  }
  const parts = path.split(".");
  let node: Record<string, unknown> | unknown[] = content as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    node = (node as Record<string, unknown>)[parts[i]] as Record<string, unknown>;
  }
  (node as Record<string, unknown>)[parts[parts.length - 1]] = value;
}

export async function decideResumeChange(id: string, changeId: string, accept: boolean): Promise<Result<Resume>> {
  return mutate(uid("decide"), () => {
    const r = getDb().resumes.find((x) => x.id === id);
    const ch = r?.changes.find((c) => c.id === changeId);
    if (!r || !ch) return fail<Resume>("NOT_FOUND");
    if (ch.status !== "pending") return ok(structuredClone(r));
    ch.status = accept ? "accepted" : "rejected";
    if (accept) {
      setPath(r.content, ch.path, ch.after);
      r.version += 1;
      r.updatedAt = nowIso();
      rescore(r);
    }
    return ok(structuredClone(r));
  });
}

export async function restoreResumeVersion(id: string, versionId: string, idempotencyKey: string): Promise<Result<Resume>> {
  return mutate(idempotencyKey, () => {
    const r = getDb().resumes.find((x) => x.id === id);
    const v = r?.versions.find((x) => x.id === versionId);
    if (!r || !v) return fail<Resume>("NOT_FOUND");
    r.versions.unshift({ id: uid("rv"), resumeId: id, version: r.version, labelBn: "পুনরুদ্ধারের আগের লেখা", createdAt: nowIso(), content: structuredClone(r.content) });
    r.content = structuredClone(v.content);
    r.version += 1;
    r.updatedAt = nowIso();
    rescore(r);
    return ok(structuredClone(r));
  });
}

// ───────── PDF (TEMP: tiny ASCII PDF writer; Part 2 renders on the server) ─────────

function pdfEscape(s: string) {
  return s.replace(/[^\x20-\x7E]/g, "?").replace(/([()\\])/g, "\\$1");
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > width) {
      lines.push(line.trim());
      line = w;
    } else line += " " + w;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function buildPdf(content: ResumeContent): Blob {
  const rows: { text: string; size: number; gap?: number }[] = [];
  const c = content;
  rows.push({ text: c.contact.fullName, size: 18 });
  rows.push({ text: [c.contact.email, c.contact.phone, c.contact.location, ...c.contact.links].filter(Boolean).join(" | "), size: 9 });
  if (c.headline) rows.push({ text: c.headline, size: 11, gap: 4 });
  const section = (title: string) => rows.push({ text: title.toUpperCase(), size: 11, gap: 10 });
  section("Summary");
  wrap(c.summary, 95).forEach((l) => rows.push({ text: l, size: 10 }));
  section("Skills");
  wrap(c.skills.join(", "), 95).forEach((l) => rows.push({ text: l, size: 10 }));
  section("Experience");
  for (const e of c.experience) {
    rows.push({ text: `${e.title} - ${e.organization} (${e.startDate} - ${e.endDate})`, size: 10, gap: 3 });
    e.bullets.forEach((b) => wrap(`- ${b}`, 92).forEach((l) => rows.push({ text: l, size: 10 })));
  }
  section("Education");
  c.education.forEach((e) => rows.push({ text: `${e.degree}, ${e.institution}, ${e.year} (${e.result})`, size: 10 }));
  if (c.certifications.length) {
    section("Certifications");
    c.certifications.forEach((x) => rows.push({ text: x, size: 10 }));
  }
  if (c.languages.length) {
    section("Languages");
    rows.push({ text: c.languages.join(", "), size: 10 });
  }
  let y = 800;
  const ops = rows.map((r) => {
    y -= (r.gap ?? 0) + r.size + 4;
    return `BT /F1 ${r.size} Tf 50 ${y} Td (${pdfEscape(r.text)}) Tj ET`;
  });
  const stream = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => (body += `${String(o).padStart(10, "0")} 00000 n \n`));
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([body], { type: "application/pdf" });
}

export async function downloadResumePdf(id: string): Promise<Result<{ fileName: string; blob: Blob }>> {
  return read(() => {
    const r = getDb().resumes.find((x) => x.id === id);
    if (!r) return fail<{ fileName: string; blob: Blob }>("NOT_FOUND");
    const name = r.content.contact.fullName.replace(/\s+/g, "_") || "resume";
    return ok({ fileName: `${name}_${r.title.replace(/\W+/g, "_")}.pdf`, blob: buildPdf(r.content) });
  });
}
