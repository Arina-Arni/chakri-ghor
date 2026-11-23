// TEMP — replaced by the real implementation in Part 2 (Supabase Auth)
import type { Result, Role } from "@/types";
import { fail, mutate, ok } from "./_runtime";
import { setRole } from "./session";
import { getDb } from "./fixtures/db";

const RATE_LIMITED_EMAIL = "ratelimit@test.com";

export async function signIn(email: string, password: string, idempotencyKey: string): Promise<Result<{ role: Role; onboardingCompleted: boolean }>> {
  return mutate(idempotencyKey, () => {
    if (email.toLowerCase() === RATE_LIMITED_EMAIL) return fail<{ role: Role; onboardingCompleted: boolean }>("RATE_LIMITED", { retryAfterSec: 60 });
    if (password.length < 8 || email.toLowerCase().startsWith("wrong")) {
      return fail<{ role: Role; onboardingCompleted: boolean }>("UNAUTHENTICATED", { message_bn: "ইমেইল বা পাসওয়ার্ড ঠিক নেই" });
    }
    const role: Role = email.startsWith("admin@") ? "admin" : email.startsWith("mod@") ? "moderator" : "seeker";
    setRole(role);
    return ok({ role, onboardingCompleted: getDb().profile.onboardingCompleted });
  });
}

export async function signInWithGoogle(): Promise<Result<{ role: Role }>> {
  return mutate(`google-${Date.now()}`, () => {
    setRole("seeker");
    return ok({ role: "seeker" as Role });
  });
}

export async function signUp(input: { fullName: string; email: string; password: string }, idempotencyKey: string): Promise<Result<{ email: string }>> {
  return mutate(idempotencyKey, () => {
    if (input.email.toLowerCase() === RATE_LIMITED_EMAIL) return fail<{ email: string }>("RATE_LIMITED", { retryAfterSec: 60 });
    if (input.email.toLowerCase() === "rahima@example.com") {
      return fail<{ email: string }>("DUPLICATE", { message_bn: "এই ইমেইলে আগেই অ্যাকাউন্ট আছে", fields: { email: "এই ইমেইলে আগেই অ্যাকাউন্ট আছে" } });
    }
    const db = getDb();
    db.profile.fullName = input.fullName;
    db.profile.email = input.email;
    db.profile.onboardingCompleted = false;
    db.profile.onboardingStep = 1;
    return ok({ email: input.email });
  });
}

/** After the "check your email" screen, the demo lets the user continue as a new seeker. */
export async function confirmEmailDemo(): Promise<Result<{ role: Role }>> {
  return mutate(`confirm-${Date.now()}`, () => {
    setRole("seeker");
    return ok({ role: "seeker" as Role });
  });
}

export async function requestPasswordReset(email: string, idempotencyKey: string): Promise<Result<{ sent: true }>> {
  return mutate(idempotencyKey, () =>
    email.toLowerCase() === RATE_LIMITED_EMAIL ? fail<{ sent: true }>("RATE_LIMITED", { retryAfterSec: 60 }) : ok({ sent: true as const }),
  );
}

export async function resetPassword(password: string, idempotencyKey: string): Promise<Result<{ done: true }>> {
  return mutate(idempotencyKey, () => (password.length >= 8 ? ok({ done: true as const }) : fail<{ done: true }>("VALIDATION")));
}

export async function signOut(): Promise<Result<{ done: true }>> {
  setRole("guest");
  return ok({ done: true as const });
}

export async function signOutEverywhere(idempotencyKey: string): Promise<Result<{ done: true }>> {
  return mutate(idempotencyKey, () => ok({ done: true as const }));
}

export async function changeEmail(newEmail: string, currentPassword: string, idempotencyKey: string): Promise<Result<{ pending: string }>> {
  return mutate(idempotencyKey, () =>
    currentPassword.length < 8
      ? fail<{ pending: string }>("UNAUTHENTICATED", { message_bn: "পাসওয়ার্ড ঠিক নেই", fields: { currentPassword: "পাসওয়ার্ড ঠিক নেই" } })
      : ok({ pending: newEmail }),
  );
}

export async function changePassword(currentPassword: string, newPassword: string, idempotencyKey: string): Promise<Result<{ done: true }>> {
  return mutate(idempotencyKey, () =>
    currentPassword.length < 8
      ? fail<{ done: true }>("UNAUTHENTICATED", { message_bn: "বর্তমান পাসওয়ার্ড ঠিক নেই", fields: { currentPassword: "বর্তমান পাসওয়ার্ড ঠিক নেই" } })
      : newPassword === currentPassword
        ? fail<{ done: true }>("VALIDATION", { fields: { password: "নতুন পাসওয়ার্ড আগেরটির মতো হতে পারে না" } })
        : ok({ done: true as const }),
  );
}
