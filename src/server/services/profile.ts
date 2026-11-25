import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { normalizeSkill, profileCompleteness } from "@/domain/profile";
import { districtById } from "@/domain/taxonomy";
import type { OnboardingStep, Profile, Settings, SpecialCategory } from "@/types";
import type { ProfilePatch } from "@/schemas/api";
import { requireUser } from "@/server/authz";
import type { Ctx } from "@/server/context";
import type { DbOrTx, Tx } from "@/server/db/client";
import {
  educations,
  experiences,
  notificationPreferences,
  preferences,
  profiles,
  userSkills,
} from "@/server/db/schema";
import { AppError } from "@/server/errors";

export type ProfileRow = typeof profiles.$inferSelect;

const DEFAULT_PREFS: Profile["preferences"] = { categoryIds: [], districtIds: [], sectors: [], jobTypes: [], workModes: [], minSalary: null };

/** Assemble the full Profile (profile row + educations + experiences + skills + preferences). */
export async function loadProfile(db: DbOrTx, userId: string, email: string): Promise<Profile> {
  // The profile row and its parts are independent reads: one round trip instead of two.
  const [[row], eds, exps, skills, [pref]] = await Promise.all([
    db.select().from(profiles).where(eq(profiles.userId, userId)),
    db.select().from(educations).where(eq(educations.userId, userId)).orderBy(asc(educations.position), asc(educations.createdAt)),
    db.select().from(experiences).where(eq(experiences.userId, userId)).orderBy(asc(experiences.position), asc(experiences.createdAt)),
    db.select().from(userSkills).where(eq(userSkills.userId, userId)).orderBy(asc(userSkills.position)),
    db.select().from(preferences).where(eq(preferences.userId, userId)),
  ]);
  if (!row) throw new AppError("NOT_FOUND");
  const base = {
    userId,
    fullName: row.fullName,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender,
    phone: row.phone,
    email,
    homeDistrictId: row.homeDistrictId,
    currentDistrictId: row.currentDistrictId,
    specialCategories: row.specialCategories as SpecialCategory[],
    headline: row.headline,
    summary: row.summary,
    links: row.links,
    experiences: exps.map((e) => ({
      id: e.id,
      title: e.title,
      organization: e.organization,
      startDate: e.startDate,
      endDate: e.endDate,
      current: e.isCurrent,
      bullets: e.bullets,
    })),
    educations: eds.map((e) => ({
      id: e.id,
      level: e.level,
      degreeName: e.degreeName,
      subject: e.subject,
      institution: e.institution,
      board: e.boardOrUniversity,
      passingYear: e.passingYear,
      result: e.resultText,
    })),
    skills: skills.map((s) => s.skill),
    preferences: pref
      ? {
          categoryIds: pref.categoryIds,
          districtIds: pref.districtIds,
          sectors: pref.sectors as Profile["preferences"]["sectors"],
          jobTypes: pref.jobTypes as Profile["preferences"]["jobTypes"],
          workModes: pref.workModes as Profile["preferences"]["workModes"],
          minSalary: pref.minSalary,
        }
      : DEFAULT_PREFS,
    aiFilledFields: row.aiFilledFields,
    onboardingStep: Math.min(4, Math.max(1, row.onboardingStep)) as OnboardingStep,
    onboardingCompleted: row.onboardingCompletedAt != null,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
  const c = profileCompleteness(base);
  return { ...base, completeness: c.pct, missingItems: c.missing };
}

function checkDistrict(id: string | null | undefined, field: string) {
  if (id && !districtById.has(id)) throw new AppError("VALIDATION", { fields: { [field]: "জেলা পাওয়া যায়নি" } });
}

/**
 * Apply a whitelisted patch inside a transaction. Child collections (educations, experiences,
 * skills) are replaced as a whole when present.
 */
async function applyPatch(tx: Tx, userId: string, patch: ProfilePatch, extra: Partial<typeof profiles.$inferInsert>, expectedVersion: number | null) {
  checkDistrict(patch.homeDistrictId, "homeDistrictId");
  checkDistrict(patch.currentDistrictId, "currentDistrictId");
  const set: Partial<typeof profiles.$inferInsert> = { ...extra, updatedAt: new Date() };
  for (const k of ["fullName", "dateOfBirth", "gender", "phone", "homeDistrictId", "currentDistrictId", "specialCategories", "headline", "summary", "links", "aiFilledFields"] as const) {
    if (patch[k] !== undefined) (set as Record<string, unknown>)[k] = patch[k];
  }
  const where = expectedVersion == null ? eq(profiles.userId, userId) : and(eq(profiles.userId, userId), eq(profiles.version, expectedVersion));
  const updated = await tx
    .update(profiles)
    .set({ ...set, version: sql`${profiles.version} + 1` })
    .where(where)
    .returning({ userId: profiles.userId });
  if (updated.length === 0) throw new AppError(expectedVersion == null ? "NOT_FOUND" : "CONFLICT");

  if (patch.educations) {
    await tx.delete(educations).where(eq(educations.userId, userId));
    if (patch.educations.length) {
      await tx.insert(educations).values(
        patch.educations.map((e, i) => ({
          userId,
          level: e.level,
          degreeName: e.degreeName,
          subject: e.subject ?? "",
          institution: e.institution,
          boardOrUniversity: e.board || null,
          resultText: e.result ?? "",
          gpa: Number.isFinite(Number(e.result)) && e.result ? Number(e.result) : null,
          passingYear: e.passingYear,
          position: i,
        })),
      );
    }
  }
  if (patch.experiences) {
    await tx.delete(experiences).where(eq(experiences.userId, userId));
    if (patch.experiences.length) {
      await tx.insert(experiences).values(
        patch.experiences.map((e, i) => ({
          userId,
          title: e.title,
          organization: e.organization,
          startDate: e.startDate,
          endDate: e.current ? null : e.endDate,
          isCurrent: e.current,
          bullets: e.bullets.filter(Boolean),
          position: i,
        })),
      );
    }
  }
  if (patch.skills) {
    const unique = [...new Map(patch.skills.map((s) => [normalizeSkill(s).toLowerCase(), normalizeSkill(s)])).values()];
    await tx.delete(userSkills).where(eq(userSkills.userId, userId));
    if (unique.length) await tx.insert(userSkills).values(unique.map((skill, i) => ({ userId, skill, position: i })));
  }
  if (patch.preferences) {
    const p = patch.preferences;
    for (const d of p.districtIds) checkDistrict(d, "preferences");
    await tx
      .insert(preferences)
      .values({ userId, ...p })
      .onConflictDoUpdate({ target: preferences.userId, set: { ...p, updatedAt: new Date() } });
  }
}

export async function getProfile(ctx: Ctx, db: DbOrTx): Promise<Profile> {
  const userId = requireUser(ctx.actor);
  return loadProfile(db, userId, ctx.actor.kind === "user" ? ctx.actor.email : "");
}

/** Optimistic locking: zero rows updated → CONFLICT (409). */
export async function updateProfile(ctx: Ctx, tx: Tx, patch: ProfilePatch, version: number): Promise<Profile> {
  const userId = requireUser(ctx.actor, "seeker.own", { mutation: true });
  await applyPatch(tx, userId, patch, {}, version);
  return loadProfile(tx, userId, ctx.actor.kind === "user" ? ctx.actor.email : "");
}

/** Each wizard step saves server-side and advances `onboarding_step`; step 4 completes it. */
export async function saveOnboardingStep(ctx: Ctx, tx: Tx, step: OnboardingStep, patch: ProfilePatch): Promise<Profile> {
  const userId = requireUser(ctx.actor, "seeker.own", { mutation: true });
  const [row] = await tx.select({ step: profiles.onboardingStep }).from(profiles).where(eq(profiles.userId, userId));
  if (!row) throw new AppError("NOT_FOUND");
  if (step === 1 && (!patch.fullName || !patch.dateOfBirth || !patch.gender || !patch.homeDistrictId)) {
    throw new AppError("VALIDATION", { message_bn: "প্রথম ধাপের সব ঘর পূরণ করুন।" });
  }
  if (step === 3 && (!patch.educations || patch.educations.length === 0)) {
    throw new AppError("VALIDATION", { fields: { educations: "কমপক্ষে একটি শিক্ষাগত যোগ্যতা দিন" } });
  }
  const extra: Partial<typeof profiles.$inferInsert> = {
    onboardingStep: Math.min(4, Math.max(row.step, step + 1)),
    ...(step === 4 ? { onboardingCompletedAt: new Date(), aiFilledFields: [] } : {}),
  };
  await applyPatch(tx, userId, patch, extra, null);
  return loadProfile(tx, userId, ctx.actor.kind === "user" ? ctx.actor.email : "");
}

// ───────── notification settings ─────────

function toSettings(row: typeof notificationPreferences.$inferSelect): Settings {
  return {
    notifications: {
      email: row.emailEnabled,
      deadlineReminders: row.deadlineReminders,
      newMatches: row.newMatches,
      examReminders: row.examReminders,
    },
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getSettings(ctx: Ctx, db: DbOrTx): Promise<Settings> {
  const userId = requireUser(ctx.actor);
  const [row] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  if (row) return toSettings(row);
  const [created] = await db.insert(notificationPreferences).values({ userId }).onConflictDoNothing().returning();
  if (created) return toSettings(created);
  const [again] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  return toSettings(again);
}

export async function saveSettings(
  ctx: Ctx,
  tx: Tx,
  patch: Partial<Settings["notifications"]>,
  version: number,
): Promise<Settings> {
  const userId = requireUser(ctx.actor, "seeker.own", { mutation: true });
  await getSettings(ctx, tx);
  const [row] = await tx
    .update(notificationPreferences)
    .set({
      ...(patch.email !== undefined ? { emailEnabled: patch.email } : {}),
      ...(patch.deadlineReminders !== undefined ? { deadlineReminders: patch.deadlineReminders } : {}),
      ...(patch.newMatches !== undefined ? { newMatches: patch.newMatches } : {}),
      ...(patch.examReminders !== undefined ? { examReminders: patch.examReminders } : {}),
      version: sql`${notificationPreferences.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.version, version)))
    .returning();
  if (!row) throw new AppError("CONFLICT");
  return toSettings(row);
}
