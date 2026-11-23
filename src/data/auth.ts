import type { Result, Role } from "@/types";
import {
  changeEmailAction,
  changePasswordAction,
  checkSessionAction,
  requestPasswordResetAction,
  resetPasswordAction,
  signInAction,
  signInWithGoogleAction,
  signOutAction,
  signOutEverywhereAction,
  signUpAction,
} from "@/server/actions/auth";
import { mutate } from "./_runtime";
import { notifySessionChanged, setRole } from "./session";

function after<T>(r: Result<T>, onOk?: (d: T) => void): Result<T> {
  if (r.ok) {
    onOk?.(r.data);
    notifySessionChanged();
  }
  return r;
}

export async function signIn(email: string, password: string, idempotencyKey: string): Promise<Result<{ role: Role; onboardingCompleted: boolean }>> {
  return after(await mutate(() => signInAction(email, password, idempotencyKey)), (d) => setRole(d.role));
}

/** Starts Google OAuth: resolves to the provider URL; the caller navigates there. */
export async function signInWithGoogle(next?: string): Promise<Result<{ url: string }>> {
  const r = await mutate(() => signInWithGoogleAction(next));
  if (r.ok && typeof window !== "undefined") window.location.assign(r.data.url);
  return r;
}

export async function signUp(input: { fullName: string; email: string; password: string }, idempotencyKey: string): Promise<Result<{ email: string }>> {
  return mutate(() => signUpAction(input, idempotencyKey));
}

/** "Continue" on the check-your-email screen: works once the confirmation link signed the user in. */
export async function confirmEmailDemo(): Promise<Result<{ role: Role }>> {
  return after(await mutate(() => checkSessionAction()), (d) => setRole(d.role));
}

export async function requestPasswordReset(email: string, idempotencyKey: string): Promise<Result<{ sent: true }>> {
  return mutate(() => requestPasswordResetAction(email, idempotencyKey));
}

export async function resetPassword(password: string, idempotencyKey: string): Promise<Result<{ done: true }>> {
  return mutate(() => resetPasswordAction(password, idempotencyKey));
}

export async function signOut(): Promise<Result<{ done: true }>> {
  return after(await mutate(() => signOutAction()), () => setRole("guest"));
}

export async function signOutEverywhere(idempotencyKey: string): Promise<Result<{ done: true }>> {
  return after(await mutate(() => signOutEverywhereAction(idempotencyKey)), () => setRole("guest"));
}

export async function changeEmail(newEmail: string, currentPassword: string, idempotencyKey: string): Promise<Result<{ pending: string }>> {
  return mutate(() => changeEmailAction(newEmail, currentPassword, idempotencyKey));
}

export async function changePassword(currentPassword: string, newPassword: string, idempotencyKey: string): Promise<Result<{ done: true }>> {
  return mutate(() => changePasswordAction(currentPassword, newPassword, idempotencyKey));
}
