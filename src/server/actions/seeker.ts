"use server";

import { z } from "zod";
import {
  applicationPatchSchema,
  applicationStatusSchema,
  notificationSettingsPayload,
  onboardingStepSchema,
  profilePatchSchema,
  reportPayload,
  resumeContentSchema,
  savedSearchPayload,
  statusMovePayload,
} from "@/schemas/api";
import type {
  Application,
  ApplicationPatch,
  ApplicationStatus,
  Billing,
  JobFilters,
  OnboardingStep,
  Profile,
  Resume,
  ResumeContent,
  Result,
  SavedSearch,
  Settings,
  TailorResult,
} from "@/types";
import { act, actDirect } from "@/server/api/act";
import { parse } from "@/server/api/validate";
import { getDb } from "@/server/db/client";
import * as applications from "@/server/services/applications";
import * as billing from "@/server/services/billing";
import * as discovery from "@/server/services/discovery";
import * as notifications from "@/server/services/notifications";
import * as profile from "@/server/services/profile";
import * as resumes from "@/server/services/resumes";

const id = z.string().min(1).max(100);
const version = z.number().int().min(0);

// ───────── profile & settings ─────────

export async function updateProfileAction(patch: Partial<Profile>, v: number, k: string): Promise<Result<Profile>> {
  return act("profile.update", k, { patch, v }, (ctx, tx) => profile.updateProfile(ctx, tx, parse(profilePatchSchema, patch), parse(version, v)));
}

export async function saveOnboardingStepAction(step: OnboardingStep, patch: Partial<Profile>, k: string): Promise<Result<Profile>> {
  return act("profile.onboarding", k, { step, patch }, (ctx, tx) =>
    profile.saveOnboardingStep(ctx, tx, parse(onboardingStepSchema, step), parse(profilePatchSchema, patch)),
  );
}

export async function saveSettingsAction(patch: Partial<Settings["notifications"]>, v: number, k: string): Promise<Result<Settings>> {
  return act("settings.save", k, { patch, v }, (ctx, tx) => profile.saveSettings(ctx, tx, parse(notificationSettingsPayload, patch), parse(version, v)));
}

// ───────── bookmarks & saved searches ─────────

export async function toggleBookmarkAction(postId: string, k: string): Promise<Result<{ bookmarked: boolean }>> {
  return act("bookmark.toggle", k, { postId }, (ctx, tx) => discovery.toggleBookmark(ctx, tx, parse(id, postId)));
}

export async function saveSearchAction(name: string, filters: JobFilters, k: string): Promise<Result<SavedSearch>> {
  return act("search.save", k, { name, filters }, (ctx, tx) => {
    const p = parse(savedSearchPayload, { name, filters });
    return discovery.saveSearch(ctx, tx, p.name, p.filters);
  });
}

export async function setSavedSearchAlertAction(searchId: string, enabled: boolean, k: string): Promise<Result<SavedSearch>> {
  return act("search.alert", k, { searchId, enabled }, (ctx, tx) => discovery.setSavedSearchAlert(ctx, tx, parse(id, searchId), parse(z.boolean(), enabled)));
}

export async function deleteSavedSearchAction(searchId: string, k: string): Promise<Result<{ id: string }>> {
  return act("search.delete", k, { searchId }, (ctx, tx) => discovery.deleteSavedSearch(ctx, tx, parse(id, searchId)));
}

export async function reportCircularErrorAction(circularId: string, message: string, k: string): Promise<Result<{ received: true }>> {
  return act("circular.report", k, { circularId, message }, (ctx, tx) =>
    discovery.reportCircularError(ctx, tx, parse(id, circularId), parse(reportPayload, { message }).message),
  );
}

export async function recordApplyClickAction(circularId: string): Promise<Result<{ counted: boolean }>> {
  return actDirect((ctx) => discovery.recordApplyClick(ctx, getDb(), parse(id, circularId)));
}

// ───────── applications ─────────

export async function createApplicationAction(postId: string, k: string, status: ApplicationStatus = "saved"): Promise<Result<Application>> {
  return act("application.create", k, { postId, status }, (ctx, tx) =>
    applications.createApplication(ctx, tx, parse(id, postId), parse(applicationStatusSchema, status)),
  );
}

export async function updateApplicationStatusAction(
  appId: string,
  to: ApplicationStatus,
  v: number,
  k: string,
  opts: { appliedAt?: string | null; examAt?: string | null } = {},
): Promise<Result<Application>> {
  return act("application.status", k, { appId, to, v, opts }, (ctx, tx) =>
    applications.updateApplicationStatus(ctx, tx, parse(id, appId), parse(applicationStatusSchema, to), parse(version, v), parse(statusMovePayload, opts)),
  );
}

export async function updateApplicationAction(appId: string, patch: ApplicationPatch, v: number, k: string): Promise<Result<Application>> {
  return act("application.update", k, { appId, patch, v }, (ctx, tx) =>
    applications.updateApplication(ctx, tx, parse(id, appId), parse(applicationPatchSchema, patch), parse(version, v)),
  );
}

export async function deleteApplicationAction(appId: string, k: string): Promise<Result<{ id: string }>> {
  return act("application.delete", k, { appId }, (ctx, tx) => applications.deleteApplication(ctx, tx, parse(id, appId)));
}

// ───────── notifications ─────────

export async function markNotificationsReadAction(ids: string[] | "all", k: string): Promise<Result<{ updated: number }>> {
  return act("notifications.read", k, { ids }, (ctx, tx) =>
    notifications.markNotificationsRead(ctx, tx, parse(z.union([z.literal("all"), z.array(id).max(200)]), ids)),
  );
}

// ───────── billing ─────────

export async function startTrialAction(k: string): Promise<Result<Billing>> {
  return act("billing.trial", k, {}, (ctx, tx) => billing.startTrial(ctx, tx));
}

export async function completeMockCheckoutAction(outcome: "success" | "fail", k: string): Promise<Result<Billing>> {
  return act("billing.checkout", k, { outcome }, (ctx, tx) => billing.completeMockCheckout(ctx, tx, parse(z.enum(["success", "fail"]), outcome)));
}

export async function setCancelAtPeriodEndAction(cancel: boolean, k: string): Promise<Result<Billing>> {
  return act("billing.cancel", k, { cancel }, (ctx, tx) => billing.setCancelAtPeriodEnd(ctx, tx, parse(z.boolean(), cancel)));
}

// ───────── resumes ─────────

export async function saveResumeAction(resumeId: string, content: ResumeContent, v: number, k: string): Promise<Result<Resume>> {
  return act("resume.save", k, { resumeId, content, v }, (ctx, tx) =>
    resumes.saveResume(ctx, tx, parse(id, resumeId), parse(resumeContentSchema, content), parse(version, v)),
  );
}

export async function tailorResumeAction(sourceId: string, postId: string, k: string): Promise<Result<TailorResult>> {
  return act("resume.tailor", k, { sourceId, postId }, (ctx, tx) => resumes.tailorResume(ctx, tx, parse(id, sourceId), parse(id, postId)));
}

export async function decideResumeChangeAction(resumeId: string, changeId: string, accept: boolean, k: string): Promise<Result<Resume>> {
  return act("resume.decide", k, { resumeId, changeId, accept }, (ctx, tx) =>
    resumes.decideResumeChange(ctx, tx, parse(id, resumeId), parse(id, changeId), parse(z.boolean(), accept)),
  );
}

export async function restoreResumeVersionAction(resumeId: string, versionId: string, k: string): Promise<Result<Resume>> {
  return act("resume.restore", k, { resumeId, versionId }, (ctx, tx) => resumes.restoreResumeVersion(ctx, tx, parse(id, resumeId), parse(id, versionId)));
}

