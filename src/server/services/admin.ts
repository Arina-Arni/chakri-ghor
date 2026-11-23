import "server-only";
import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { dhakaToUtc } from "@/domain/bn";
import type { AdminSettings, AdminUser, AuditLogEntry, FeatureFlags, Organization, Role } from "@/types";
import { authorize, requireUser } from "@/server/authz";
import { writeAudit } from "@/server/audit";
import type { Ctx } from "@/server/context";
import type { DbOrTx, Tx } from "@/server/db/client";
import { authUsers } from "@/server/db/auth-schema";
import { appSettings, auditLogs, circulars, organizations, profiles } from "@/server/db/schema";
import { AppError } from "@/server/errors";
import { toOrganization } from "./discovery";

// ───────── organizations ─────────

type OrgInput = Pick<Organization, "nameBn" | "nameEn" | "shortName" | "type"> & { website: string | null };

function orgSlug(nameEn: string): string {
  return nameEn.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "org";
}

export async function saveOrganization(ctx: Ctx, tx: Tx, data: OrgInput, id: string | null, version: number | null): Promise<Organization> {
  const userId = requireUser(ctx.actor, "organization.edit", { mutation: true });
  const values = { nameBn: data.nameBn, nameEn: data.nameEn, shortName: data.shortName, type: data.type, website: data.website || null };
  if (id) {
    const [before] = await tx.select().from(organizations).where(and(eq(organizations.id, id), sql`${organizations.deletedAt} is null`));
    if (!before) throw new AppError("NOT_FOUND");
    const [row] = await tx
      .update(organizations)
      .set({ ...values, version: sql`${organizations.version} + 1`, updatedAt: new Date(ctx.now()) })
      .where(and(eq(organizations.id, id), eq(organizations.version, version ?? -1)))
      .returning();
    if (!row) throw new AppError("CONFLICT");
    await writeAudit(tx, ctx, { action: "organization.update", entityType: "organization", entityId: id, before: { nameBn: before.nameBn, nameEn: before.nameEn, website: before.website }, after: values });
    return toOrganization(row);
  }
  const [row] = await tx.insert(organizations).values({ ...values, slug: orgSlug(data.nameEn), createdBy: userId }).returning();
  await writeAudit(tx, ctx, { action: "organization.create", entityType: "organization", entityId: row.id, after: values });
  return toOrganization(row);
}

export async function setOrganizationVerified(ctx: Ctx, tx: Tx, id: string, verified: boolean): Promise<Organization> {
  const userId = requireUser(ctx.actor, "organization.verify", { mutation: true });
  const [before] = await tx.select().from(organizations).where(eq(organizations.id, id));
  if (!before) throw new AppError("NOT_FOUND");
  const [row] = await tx
    .update(organizations)
    .set({ verified, verifiedBy: verified ? userId : null, verifiedAt: verified ? new Date(ctx.now()) : null, version: sql`${organizations.version} + 1`, updatedAt: new Date(ctx.now()) })
    .where(eq(organizations.id, id))
    .returning();
  await writeAudit(tx, ctx, { action: "organization.verify", entityType: "organization", entityId: id, before: { verified: before.verified }, after: { verified } });
  return toOrganization(row);
}

/** Soft delete; refused while the organization still has circulars (FK is RESTRICT too). */
export async function deleteOrganization(ctx: Ctx, tx: Tx, id: string): Promise<{ id: string }> {
  requireUser(ctx.actor, "organization.edit", { mutation: true });
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(circulars).where(and(eq(circulars.organizationId, id), sql`${circulars.deletedAt} is null`));
  if (Number(n) > 0) throw new AppError("VALIDATION", { message_bn: "এই প্রতিষ্ঠানের সার্কুলার আছে — মুছে ফেলা যাবে না।" });
  const rows = await tx.update(organizations).set({ deletedAt: new Date(ctx.now()) }).where(eq(organizations.id, id)).returning({ id: organizations.id });
  if (!rows.length) throw new AppError("NOT_FOUND");
  await writeAudit(tx, ctx, { action: "organization.delete", entityType: "organization", entityId: id });
  return { id };
}

// ───────── users ─────────

function toAdminUser(r: { userId: string; fullName: string; role: string; status: "active" | "suspended"; createdAt: Date; email: string | null }): AdminUser {
  return {
    id: r.userId,
    name: r.fullName || (r.email ?? "").split("@")[0],
    email: r.email ?? "",
    role: (r.role === "employer" ? "seeker" : r.role) as AdminUser["role"],
    status: r.status,
    joinedAt: r.createdAt.toISOString(),
  };
}

const userSelect = {
  userId: profiles.userId,
  fullName: profiles.fullName,
  role: profiles.role,
  status: profiles.status,
  createdAt: profiles.createdAt,
  email: authUsers.email,
};

export async function listUsers(ctx: Ctx, db: DbOrTx, f: { q?: string; role?: string }): Promise<AdminUser[]> {
  authorize(ctx.actor, "user.manage");
  const q = f.q?.trim();
  const rows = await db
    .select(userSelect)
    .from(profiles)
    .leftJoin(authUsers, eq(authUsers.id, profiles.userId))
    .where(
      and(
        q ? or(ilike(profiles.fullName, `%${q}%`), ilike(authUsers.email, `%${q}%`)) : undefined,
        f.role && f.role !== "all" ? eq(profiles.role, f.role as "seeker") : undefined,
      ),
    )
    .orderBy(desc(profiles.createdAt))
    .limit(500);
  return rows.map(toAdminUser);
}

async function userById(db: DbOrTx, id: string) {
  const [row] = await db.select(userSelect).from(profiles).leftJoin(authUsers, eq(authUsers.id, profiles.userId)).where(eq(profiles.userId, id));
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

/**
 * Admin-only, with re-authentication (`passwordOk` is checked by the caller against the
 * admin's own password). An admin cannot change their own role.
 */
export async function changeUserRole(ctx: Ctx, tx: Tx, userId: string, role: AdminUser["role"], passwordOk: boolean): Promise<AdminUser> {
  const adminId = requireUser(ctx.actor, "user.manage", { mutation: true });
  if (!passwordOk) throw new AppError("UNAUTHENTICATED", { message_bn: "পাসওয়ার্ড ঠিক নেই", fields: { adminPassword: "পাসওয়ার্ড ঠিক নেই" } });
  if (userId === adminId) throw new AppError("VALIDATION", { message_bn: "নিজের ভূমিকা নিজে বদলানো যায় না।" });
  const before = await userById(tx, userId);
  await tx.update(profiles).set({ role, version: sql`${profiles.version} + 1`, updatedAt: new Date(ctx.now()) }).where(eq(profiles.userId, userId));
  await writeAudit(tx, ctx, { action: "user.role_change", entityType: "user", entityId: userId, before: { role: before.role }, after: { role } });
  return toAdminUser({ ...before, role });
}

export async function setUserStatus(ctx: Ctx, tx: Tx, userId: string, status: AdminUser["status"]): Promise<AdminUser> {
  const adminId = requireUser(ctx.actor, "user.manage", { mutation: true });
  if (userId === adminId) throw new AppError("VALIDATION", { message_bn: "নিজের অ্যাকাউন্ট স্থগিত করা যায় না।" });
  const before = await userById(tx, userId);
  await tx.update(profiles).set({ status, version: sql`${profiles.version} + 1`, updatedAt: new Date(ctx.now()) }).where(eq(profiles.userId, userId));
  await writeAudit(tx, ctx, { action: status === "suspended" ? "user.suspend" : "user.unsuspend", entityType: "user", entityId: userId, before: { status: before.status }, after: { status } });
  return toAdminUser({ ...before, status });
}

// ───────── audit log ─────────

export async function listAuditLogs(ctx: Ctx, db: DbOrTx, f: { actor?: string; action?: string; entity?: string; from?: string; to?: string }): Promise<AuditLogEntry[]> {
  authorize(ctx.actor, "audit.read");
  const rows = await db
    .select({ a: auditLogs, name: profiles.fullName })
    .from(auditLogs)
    .leftJoin(profiles, eq(profiles.userId, auditLogs.actorId))
    .where(
      and(
        f.actor ? ilike(profiles.fullName, `%${f.actor}%`) : undefined,
        f.action ? ilike(auditLogs.action, `%${f.action}%`) : undefined,
        f.entity && f.entity !== "all" ? eq(auditLogs.entityType, f.entity) : undefined,
        f.from ? gte(auditLogs.createdAt, dhakaToUtc(f.from, "00:00")) : undefined,
        f.to ? lte(auditLogs.createdAt, new Date(dhakaToUtc(f.to, "00:00").getTime() + 86_400_000)) : undefined,
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(300);
  return rows.map(({ a, name }) => ({
    id: a.id,
    at: a.createdAt.toISOString(),
    actor: { id: a.actorId ?? "", name: name || a.actorRole, role: (a.actorRole === "employer" ? "seeker" : a.actorRole) as Role },
    action: a.action,
    entityType: a.entityType as AuditLogEntry["entityType"],
    entityId: a.entityId,
    before: a.before,
    after: a.after,
    requestId: a.requestId ?? "",
  }));
}

// ───────── settings (flags, quotas) ─────────

export const DEFAULT_SETTINGS: AdminSettings = {
  flags: { autoPublish: false, aiSearch: true, aiCvParse: true, aiResumeTailor: true, aiCircularExtract: true },
  quotas: {
    free: { aiSearchPerDay: 10, resumeTailorPerDay: 1, cvParsePerDay: 2 },
    premium: { aiSearchPerDay: 100, resumeTailorPerDay: 10, cvParsePerDay: 10 },
  },
  /** Per day (spec Part 3 plans). */
  premiumPriceBdt: 4,
};

export async function readSettings(db: DbOrTx): Promise<AdminSettings> {
  const rows = await db.select().from(appSettings);
  const by = new Map(rows.map((r) => [r.key, r.value]));
  return {
    flags: { ...DEFAULT_SETTINGS.flags, ...((by.get("flags") as Partial<FeatureFlags>) ?? {}) },
    quotas: { ...DEFAULT_SETTINGS.quotas, ...((by.get("quotas") as AdminSettings["quotas"]) ?? {}) },
    premiumPriceBdt: (by.get("premiumPriceBdt") as number | undefined) ?? DEFAULT_SETTINGS.premiumPriceBdt,
  };
}

async function writeSetting(tx: Tx, ctx: Ctx, key: string, value: unknown) {
  const userId = ctx.actor.kind === "user" ? ctx.actor.userId : null;
  await tx
    .insert(appSettings)
    .values({ key, value, updatedBy: userId })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: userId, updatedAt: new Date(ctx.now()), version: sql`${appSettings.version} + 1` } });
}

export async function getFeatureFlags(ctx: Ctx, db: DbOrTx): Promise<AdminSettings> {
  authorize(ctx.actor, "admin.dashboard");
  return readSettings(db);
}

export async function setFeatureFlag(ctx: Ctx, tx: Tx, flag: keyof FeatureFlags, value: boolean): Promise<AdminSettings> {
  requireUser(ctx.actor, "settings.manage", { mutation: true });
  const current = await readSettings(tx);
  if (!(flag in current.flags)) throw new AppError("VALIDATION");
  await writeSetting(tx, ctx, "flags", { ...current.flags, [flag]: value });
  await writeAudit(tx, ctx, { action: "settings.flag", entityType: "settings", entityId: flag, before: { [flag]: current.flags[flag] }, after: { [flag]: value } });
  return readSettings(tx);
}

export async function savePlanSettings(ctx: Ctx, tx: Tx, quotas: AdminSettings["quotas"], premiumPriceBdt: number): Promise<AdminSettings> {
  requireUser(ctx.actor, "settings.manage", { mutation: true });
  const current = await readSettings(tx);
  await writeSetting(tx, ctx, "quotas", quotas);
  await writeSetting(tx, ctx, "premiumPriceBdt", premiumPriceBdt);
  await writeAudit(tx, ctx, { action: "settings.quotas", entityType: "settings", entityId: "quotas", before: { quotas: current.quotas, premiumPriceBdt: current.premiumPriceBdt }, after: { quotas, premiumPriceBdt } });
  return readSettings(tx);
}

