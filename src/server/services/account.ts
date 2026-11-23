import "server-only";
import { desc, eq } from "drizzle-orm";
import { dhakaDateKey } from "@/domain/bn";
import { initials } from "@/domain/profile";
import { serverEnv } from "@/env";
import { t } from "@/i18n";
import type { Me, Role } from "@/types";
import { requireUser } from "@/server/authz";
import { writeAudit } from "@/server/audit";
import type { Ctx } from "@/server/context";
import { getDb, type DbOrTx } from "@/server/db/client";
import { bookmarks, notifications, profiles, savedSearches } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { AUTH_LIMITS, enforce } from "@/server/rate-limit";
import { supabaseAdmin, supabaseServer, verifyPassword } from "@/server/supabase";
import { listApplications } from "./applications";
import { getBilling } from "./billing";
import { unreadCount } from "./notifications";
import { getSettings, loadProfile } from "./profile";
import { listResumes, getResume } from "./resumes";

const rateKeys = (ctx: Ctx, kind: string, email?: string) =>
  [`${kind}:ip:${ctx.ipHash ?? "unknown"}`, ...(email ? [`${kind}:email:${email.trim().toLowerCase()}`] : [])];

function appUrl(path: string): string {
  return new URL(path, serverEnv().APP_URL).toString();
}

export async function getMe(ctx: Ctx, db: DbOrTx): Promise<Me | null> {
  if (ctx.actor.kind !== "user") return null;
  if (ctx.actor.status === "suspended") {
    // Suspended accounts are signed out.
    await (await supabaseServer()).auth.signOut({ scope: "local" }).catch(() => {});
    return null;
  }
  const profile = await loadProfile(db, ctx.actor.userId, ctx.actor.email);
  const [billing, unread] = await Promise.all([getBilling(ctx, db), unreadCount(db, ctx.actor.userId)]);
  const name = profile.fullName || ctx.actor.email.split("@")[0];
  return {
    id: ctx.actor.userId,
    role: (ctx.actor.role === "employer" ? "seeker" : ctx.actor.role) as Role,
    fullName: name,
    email: ctx.actor.email,
    initials: initials(name),
    onboardingStep: profile.onboardingStep,
    onboardingCompleted: profile.onboardingCompleted,
    profileCompleteness: profile.completeness,
    planId: billing.subscription.planId,
    unreadNotifications: unread,
  };
}

export async function signIn(ctx: Ctx, email: string, password: string): Promise<{ role: Role; onboardingCompleted: boolean }> {
  await enforce(rateKeys(ctx, "login", email), AUTH_LIMITS.login, ctx.now());
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.user) {
    if (error?.code === "email_not_confirmed") {
      throw new AppError("UNAUTHENTICATED", { message_bn: "ইমেইল এখনো যাচাই হয়নি — ইনবক্সের লিংকে ক্লিক করুন।" });
    }
    if (error?.status === 429) throw new AppError("RATE_LIMITED", { retryAfterSec: 60 });
    throw new AppError("UNAUTHENTICATED", { message_bn: "ইমেইল বা পাসওয়ার্ড ঠিক নেই" });
  }
  const [row] = await getDb().select().from(profiles).where(eq(profiles.userId, data.user.id));
  if (!row) throw new AppError("UNKNOWN");
  if (row.status === "suspended") {
    await supabase.auth.signOut({ scope: "local" });
    throw new AppError("FORBIDDEN", { message_bn: "আপনার অ্যাকাউন্ট স্থগিত করা হয়েছে।" });
  }
  return { role: (row.role === "employer" ? "seeker" : row.role) as Role, onboardingCompleted: row.onboardingCompletedAt != null };
}

export async function signUp(ctx: Ctx, input: { fullName: string; email: string; password: string }): Promise<{ email: string }> {
  await enforce(rateKeys(ctx, "signup", input.email), AUTH_LIMITS.signup, ctx.now());
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: { data: { full_name: input.fullName.trim() }, emailRedirectTo: appUrl("/auth/confirm?next=/onboarding") },
  });
  if (error) {
    if (error.code === "user_already_exists") {
      throw new AppError("DUPLICATE", { message_bn: "এই ইমেইলে আগেই অ্যাকাউন্ট আছে", fields: { email: "এই ইমেইলে আগেই অ্যাকাউন্ট আছে" } });
    }
    if (error.code === "weak_password") throw new AppError("VALIDATION", { fields: { password: t("validation.passwordWeak") } });
    if (error.status === 429) throw new AppError("RATE_LIMITED", { retryAfterSec: 60 });
    throw new AppError("UNKNOWN");
  }
  // With email confirmation on, an existing address returns a user without identities.
  if (data.user && data.user.identities?.length === 0) {
    throw new AppError("DUPLICATE", { message_bn: "এই ইমেইলে আগেই অ্যাকাউন্ট আছে", fields: { email: "এই ইমেইলে আগেই অ্যাকাউন্ট আছে" } });
  }
  return { email: input.email.trim() };
}

export async function signInWithGoogle(_ctx: Ctx, next: string): Promise<{ url: string }> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: appUrl(`/auth/callback?next=${encodeURIComponent(next)}`), skipBrowserRedirect: true },
  });
  if (error || !data.url) throw new AppError("UNKNOWN");
  return { url: data.url };
}

export async function requestPasswordReset(ctx: Ctx, email: string): Promise<{ sent: true }> {
  await enforce(rateKeys(ctx, "reset", email), AUTH_LIMITS.reset, ctx.now());
  const supabase = await supabaseServer();
  // Same answer whether or not the address exists.
  await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl("/auth/confirm?next=/reset-password") }).catch(() => {});
  return { sent: true };
}

/** After the recovery link, the user has a short-lived session and sets a new password. */
export async function resetPassword(ctx: Ctx, password: string): Promise<{ done: true }> {
  if (ctx.actor.kind !== "user") throw new AppError("UNAUTHENTICATED", { message_bn: "রিসেট লিংকের মেয়াদ শেষ — আবার লিংক নিন।" });
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") throw new AppError("VALIDATION", { fields: { password: "নতুন পাসওয়ার্ড আগেরটির মতো হতে পারে না" } });
    if (error.code === "weak_password") throw new AppError("VALIDATION", { fields: { password: t("validation.passwordWeak") } });
    throw new AppError("UNKNOWN");
  }
  return { done: true };
}

export async function signOut(): Promise<{ done: true }> {
  await (await supabaseServer()).auth.signOut({ scope: "local" }).catch(() => {});
  return { done: true };
}

/** "Sign out of all devices": revokes every refresh token of the user. */
export async function signOutEverywhere(ctx: Ctx): Promise<{ done: true }> {
  requireUser(ctx.actor, "seeker.own", { mutation: false });
  await (await supabaseServer()).auth.signOut({ scope: "global" });
  return { done: true };
}

async function reauth(ctx: Ctx, password: string, field = "currentPassword"): Promise<string> {
  const userId = requireUser(ctx.actor, "seeker.own", { mutation: true });
  await enforce(rateKeys(ctx, "reauth", ctx.actor.kind === "user" ? ctx.actor.email : undefined), AUTH_LIMITS.login, ctx.now());
  const ok = await verifyPassword(ctx.actor.kind === "user" ? ctx.actor.email : "", password);
  if (!ok) throw new AppError("UNAUTHENTICATED", { message_bn: "পাসওয়ার্ড ঠিক নেই", fields: { [field]: "পাসওয়ার্ড ঠিক নেই" } });
  return userId;
}

/** Re-authentication required (spec §2). Supabase sends a confirmation to the new address. */
export async function changeEmail(ctx: Ctx, newEmail: string, currentPassword: string): Promise<{ pending: string }> {
  await reauth(ctx, currentPassword);
  const { error } = await (await supabaseServer()).auth.updateUser({ email: newEmail.trim() }, { emailRedirectTo: appUrl("/auth/confirm?next=/settings") });
  if (error) {
    if (error.code === "email_exists") throw new AppError("DUPLICATE", { fields: { newEmail: "এই ইমেইলে আগেই অ্যাকাউন্ট আছে" } });
    throw new AppError("UNKNOWN");
  }
  return { pending: newEmail.trim() };
}

export async function changePassword(ctx: Ctx, currentPassword: string, newPassword: string): Promise<{ done: true }> {
  if (currentPassword === newPassword) throw new AppError("VALIDATION", { fields: { password: "নতুন পাসওয়ার্ড আগেরটির মতো হতে পারে না" } });
  await reauth(ctx, currentPassword);
  const { error } = await (await supabaseServer()).auth.updateUser({ password: newPassword });
  if (error) throw new AppError(error.code === "weak_password" ? "VALIDATION" : "UNKNOWN");
  return { done: true };
}

/** Data export (privacy): everything we hold about the user, as JSON. */
export async function exportMyData(ctx: Ctx, db: DbOrTx): Promise<{ fileName: string; json: string }> {
  const userId = requireUser(ctx.actor);
  const email = ctx.actor.kind === "user" ? ctx.actor.email : "";
  const [profile, apps, resumeList, searches, bms, notes, settings] = await Promise.all([
    loadProfile(db, userId, email),
    listApplications(ctx, db, {}),
    listResumes(ctx, db),
    db.select().from(savedSearches).where(eq(savedSearches.userId, userId)),
    db.select().from(bookmarks).where(eq(bookmarks.userId, userId)),
    db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)),
    getSettings(ctx, db),
  ]);
  const resumesFull = await Promise.all(resumeList.map((r) => getResume(ctx, db, r.id)));
  const data = {
    exportedAt: new Date(ctx.now()).toISOString(),
    profile,
    bookmarks: bms,
    applications: apps,
    resumes: resumesFull,
    savedSearches: searches,
    notifications: notes,
    settings,
  };
  return { fileName: `chakri-radar-data-${dhakaDateKey(ctx.now())}.json`, json: JSON.stringify(data, null, 2) };
}

/**
 * Account deletion (privacy): re-authenticate, audit, then delete the auth user. Every
 * user-owned row cascades from profiles.
 */
export async function deleteAccount(ctx: Ctx, confirmation: { text: string; password: string }): Promise<{ deleted: true }> {
  if (confirmation.text.trim() !== t("settings.deleteConfirmWord")) {
    throw new AppError("VALIDATION", { fields: { confirmation: t("validation.confirmText", { word: t("settings.deleteConfirmWord") }) } });
  }
  const userId = await reauth(ctx, confirmation.password);
  await getDb().transaction(async (tx) => {
    await writeAudit(tx, ctx, { action: "account.delete", entityType: "account", entityId: userId });
  });
  const { error } = await supabaseAdmin().auth.admin.deleteUser(userId);
  if (error) throw new AppError("UNKNOWN");
  await (await supabaseServer()).auth.signOut({ scope: "local" }).catch(() => {});
  return { deleted: true };
}
