import type { Resume, ResumeContent, ResumeListItem, Result, TailorResult } from "@/types";
import {
  decideResumeChangeAction,
  restoreResumeVersionAction,
  saveResumeAction,
  tailorResumeAction,
} from "@/server/actions/seeker";
import { fail, mutate, newKey, query } from "./_runtime";

export async function listResumes(): Promise<Result<ResumeListItem[]>> {
  return query("listResumes", [], { empty: () => [] });
}

export async function getResume(id: string): Promise<Result<Resume>> {
  return query("getResume", [id]);
}

export async function saveResume(id: string, content: ResumeContent, version: number, idempotencyKey: string): Promise<Result<Resume>> {
  return mutate(() => saveResumeAction(id, content, version, idempotencyKey), { versioned: true });
}

/**
 * Tailor a resume to a post. Part 2: template tailoring (skills and bullets ordered by the
 * post's keywords, missing keywords suggested) — `mode: "fallback"`. Part 3 adds the AI path.
 */
export async function tailorResume(id: string, postId: string, idempotencyKey: string): Promise<Result<TailorResult>> {
  return mutate(() => tailorResumeAction(id, postId, idempotencyKey));
}

export async function decideResumeChange(id: string, changeId: string, accept: boolean): Promise<Result<Resume>> {
  return mutate(() => decideResumeChangeAction(id, changeId, accept, newKey()));
}

export async function restoreResumeVersion(id: string, versionId: string, idempotencyKey: string): Promise<Result<Resume>> {
  return mutate(() => restoreResumeVersionAction(id, versionId, idempotencyKey));
}

/** Server-rendered PDF (English, single column). */
export async function downloadResumePdf(id: string): Promise<Result<{ fileName: string; blob: Blob }>> {
  try {
    const res = await fetch(`/api/resumes/${encodeURIComponent(id)}/pdf`, { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as Result<never> | null;
      return body && !body.ok ? body : fail("UNKNOWN");
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "resume.pdf";
    return { ok: true, data: { fileName: name, blob: await res.blob() } };
  } catch {
    return fail("NETWORK");
  }
}
