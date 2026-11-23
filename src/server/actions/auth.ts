"use server";

import { z } from "zod";
import { password as passwordRule } from "@/schemas/auth";
import { email as emailRule } from "@/schemas/common";
import type { Result, Role } from "@/types";
import { actDirect } from "@/server/api/act";
import { parse } from "@/server/api/validate";
import { safeNext } from "@/lib/safe-next";
import * as account from "@/server/services/account";

// Auth calls change Supabase Auth state (cookies), not our rows, so they are not replayed
// from the idempotency store; the key is accepted for a uniform client API.

export async function signInAction(email: string, password: string, _key: string): Promise<Result<{ role: Role; onboardingCompleted: boolean }>> {
  return actDirect((ctx) => account.signIn(ctx, parse(emailRule, email), parse(z.string().min(1).max(200), password)));
}

export async function signInWithGoogleAction(next?: string): Promise<Result<{ url: string }>> {
  return actDirect((ctx) => account.signInWithGoogle(ctx, safeNext(next, "/dashboard")));
}

export async function signUpAction(input: { fullName: string; email: string; password: string }, _key: string): Promise<Result<{ email: string }>> {
  return actDirect((ctx) =>
    account.signUp(ctx, parse(z.object({ fullName: z.string().trim().min(2).max(80), email: emailRule, password: passwordRule }), input)),
  );
}

/** "I've confirmed my email": succeeds only when the confirmation link created a session. */
export async function checkSessionAction(): Promise<Result<{ role: Role }>> {
  return actDirect(async (ctx) => {
    if (ctx.actor.kind !== "user") {
      const { AppError } = await import("@/server/errors");
      throw new AppError("UNAUTHENTICATED", { message_bn: "ইমেইলের লিংকে ক্লিক করে যাচাই করুন, তারপর আবার চেষ্টা করুন।" });
    }
    return { role: (ctx.actor.role === "employer" ? "seeker" : ctx.actor.role) as Role };
  });
}

export async function requestPasswordResetAction(email: string, _key: string): Promise<Result<{ sent: true }>> {
  return actDirect((ctx) => account.requestPasswordReset(ctx, parse(emailRule, email)));
}

export async function resetPasswordAction(password: string, _key: string): Promise<Result<{ done: true }>> {
  return actDirect((ctx) => account.resetPassword(ctx, parse(passwordRule, password)));
}

export async function signOutAction(): Promise<Result<{ done: true }>> {
  return actDirect(() => account.signOut());
}

export async function signOutEverywhereAction(_key: string): Promise<Result<{ done: true }>> {
  return actDirect((ctx) => account.signOutEverywhere(ctx));
}

export async function changeEmailAction(newEmail: string, currentPassword: string, _key: string): Promise<Result<{ pending: string }>> {
  return actDirect((ctx) => account.changeEmail(ctx, parse(emailRule, newEmail), parse(z.string().min(1).max(200), currentPassword)));
}

export async function changePasswordAction(currentPassword: string, newPassword: string, _key: string): Promise<Result<{ done: true }>> {
  return actDirect((ctx) => account.changePassword(ctx, parse(z.string().min(1).max(200), currentPassword), parse(passwordRule, newPassword)));
}

export async function deleteAccountAction(confirmation: { text: string; password: string }): Promise<Result<{ deleted: true }>> {
  return actDirect((ctx) => account.deleteAccount(ctx, parse(z.object({ text: z.string().max(40), password: z.string().min(1).max(200) }), confirmation)));
}
