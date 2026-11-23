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
import { deleteAccountAction } from "@/server/actions/auth";
import {
  completeMockCheckoutAction,
  createApplicationAction,
  deleteApplicationAction,
  deleteSavedSearchAction,
  markNotificationsReadAction,
  saveOnboardingStepAction,
  saveSearchAction,
  saveSettingsAction,
  setCancelAtPeriodEndAction,
  setSavedSearchAlertAction,
  startTrialAction,
  toggleBookmarkAction,
  updateApplicationAction,
  updateApplicationStatusAction,
  updateProfileAction,
} from "@/server/actions/seeker";
import { fail, forcedState, mutate, newKey, query } from "./_runtime";
import { notifySessionChanged, setRole } from "./session";

export { profileCompleteness } from "@/domain/profile";
export { APPLICATION_EDGES as APPLICATION_TRANSITIONS } from "@/domain/state-machines";

// ───────── session & profile ─────────

export async function getMe(): Promise<Result<Me | null>> {
  const r = await query<Me | null>("getMe", [], { ignoreForced: true, signedIn: false });
  if (r.ok) setRole(r.data?.role ?? "guest");
  return r;
}

export async function getProfile(): Promise<Result<Profile>> {
  return query("getProfile");
}

export async function updateProfile(patch: Partial<Profile>, version: number, idempotencyKey: string): Promise<Result<Profile>> {
  const r = await mutate(() => updateProfileAction(patch, version, idempotencyKey), { versioned: true });
  if (r.ok) notifySessionChanged();
  return r;
}

export async function saveOnboardingStep(step: OnboardingStep, data: Partial<Profile>, idempotencyKey: string): Promise<Result<Profile>> {
  const r = await mutate(() => saveOnboardingStepAction(step, data, idempotencyKey));
  if (r.ok && step === 4) notifySessionChanged();
  return r;
}

/**
 * CV upload with progress (XHR so the bar can move). The server checks the real file type,
 * size and encryption, extracts text in memory and never stores the file.
 */
export async function uploadCv(
  file: File,
  idempotencyKey: string,
  opts: { onProgress?: (pct: number) => void; consent?: boolean } = {},
): Promise<Result<CvParseResult>> {
  void idempotencyKey; // The server dedupes by file hash (same file within 24 h reuses the result).
  if (file.size > 5 * 1024 * 1024) return fail("FILE_TOO_LARGE");
  if (!/\.(pdf|docx|txt)$/i.test(file.name)) return fail("FILE_TYPE");
  const state = forcedState();
  if (state === "error") return fail("UNKNOWN");
  const form = new FormData();
  form.append("file", file);
  form.append("consent", String(opts.consent ?? true));
  return new Promise<Result<CvParseResult>>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/cv");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.upload.onload = () => opts.onProgress?.(100);
    xhr.onload = () => {
      const body = xhr.response as Result<CvParseResult> | null;
      resolve(body && typeof body.ok === "boolean" ? body : fail("UNKNOWN"));
    };
    xhr.onerror = () => resolve(fail("NETWORK"));
    xhr.send(form);
  });
}

export async function checkEligibility(postId: string): Promise<Result<EligibilityResult>> {
  return query("checkEligibility", [postId]);
}

// ───────── bookmarks & saved searches ─────────

export async function toggleBookmark(postId: string, idempotencyKey: string): Promise<Result<{ bookmarked: boolean }>> {
  return mutate(() => toggleBookmarkAction(postId, idempotencyKey));
}

export async function listBookmarks(): Promise<Result<(Bookmark & { job: CircularListItem })[]>> {
  return query("listBookmarks", [], { empty: () => [] });
}

export async function saveSearch(name: string, filters: JobFilters, idempotencyKey: string): Promise<Result<SavedSearch>> {
  return mutate(() => saveSearchAction(name, filters, idempotencyKey));
}

export async function listSavedSearches(): Promise<Result<SavedSearch[]>> {
  return query("listSavedSearches", [], { empty: () => [] });
}

export async function setSavedSearchAlert(id: string, enabled: boolean, idempotencyKey: string): Promise<Result<SavedSearch>> {
  return mutate(() => setSavedSearchAlertAction(id, enabled, idempotencyKey));
}

export async function deleteSavedSearch(id: string, idempotencyKey: string): Promise<Result<{ id: string }>> {
  return mutate(() => deleteSavedSearchAction(id, idempotencyKey));
}

// ───────── applications ─────────

export async function listApplications(filter: { status?: ApplicationStatus | "all" } = {}): Promise<Result<Application[]>> {
  return query("listApplications", [filter], { empty: () => [] });
}

export async function createApplication(postId: string, idempotencyKey: string, status: ApplicationStatus = "saved"): Promise<Result<Application>> {
  return mutate(() => createApplicationAction(postId, idempotencyKey, status));
}

export async function updateApplicationStatus(
  id: string,
  to: ApplicationStatus,
  version: number,
  idempotencyKey: string,
  opts: { appliedAt?: string | null; examAt?: string | null } = {},
): Promise<Result<Application>> {
  return mutate(() => updateApplicationStatusAction(id, to, version, idempotencyKey, opts), { versioned: true });
}

export async function updateApplication(id: string, patch: ApplicationPatch, version: number, idempotencyKey: string): Promise<Result<Application>> {
  return mutate(() => updateApplicationAction(id, patch, version, idempotencyKey), { versioned: true });
}

export async function deleteApplication(id: string, idempotencyKey: string): Promise<Result<{ id: string }>> {
  return mutate(() => deleteApplicationAction(id, idempotencyKey));
}

// ───────── notifications ─────────

export async function listNotifications(): Promise<Result<Notification[]>> {
  return query("listNotifications", [], { empty: () => [] });
}

export async function markNotificationsRead(ids: string[] | "all"): Promise<Result<{ updated: number }>> {
  const r = await mutate(() => markNotificationsReadAction(ids, newKey()));
  if (r.ok) notifySessionChanged();
  return r;
}

// ───────── dashboard ─────────

export async function getSeekerDashboard(): Promise<Result<SeekerDashboard>> {
  return query("getSeekerDashboard");
}

// ───────── billing ─────────

/** Public plan list for /pricing (no login needed). */
export async function getPlans(): Promise<Result<Billing["plans"]>> {
  return query("getPlans", [], { signedIn: false });
}

export async function getBilling(): Promise<Result<Billing>> {
  return query("getBilling");
}

export async function startTrial(idempotencyKey: string): Promise<Result<Billing>> {
  return mutate(() => startTrialAction(idempotencyKey));
}

export async function completeMockCheckout(outcome: "success" | "fail", idempotencyKey: string): Promise<Result<Billing>> {
  return mutate(() => completeMockCheckoutAction(outcome, idempotencyKey));
}

export async function setCancelAtPeriodEnd(cancel: boolean, idempotencyKey: string): Promise<Result<Billing>> {
  return mutate(() => setCancelAtPeriodEndAction(cancel, idempotencyKey));
}

// ───────── settings & data ─────────

export async function getSettings(): Promise<Result<Settings>> {
  return query("getSettings");
}

export async function saveSettings(patch: Partial<Settings["notifications"]>, version: number, idempotencyKey: string): Promise<Result<Settings>> {
  return mutate(() => saveSettingsAction(patch, version, idempotencyKey), { versioned: true });
}

export async function exportMyData(): Promise<Result<{ fileName: string; json: string }>> {
  return query("exportMyData");
}

export async function deleteAccount(confirmation: { text: string; password: string }): Promise<Result<{ deleted: true }>> {
  const r = await mutate(() => deleteAccountAction(confirmation));
  if (r.ok) {
    setRole("guest");
    notifySessionChanged();
  }
  return r;
}
