import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { NEXT_ACTION_BN, canTransitionApplication } from "@/domain/state-machines";
import { t } from "@/i18n";
import type { Application, ApplicationPatch, ApplicationStatus } from "@/types";
import { requireUser } from "@/server/authz";
import type { Ctx } from "@/server/context";
import type { DbOrTx, Tx } from "@/server/db/client";
import { isPublicCircular } from "@/server/db/queries/circulars";
import { applicationEvents, applications, circularPosts, circulars, organizations } from "@/server/db/schema";
import { AppError } from "@/server/errors";

type AppRow = typeof applications.$inferSelect;

async function hydrate(db: DbOrTx, rows: AppRow[]): Promise<Application[]> {
  if (rows.length === 0) return [];
  const postIds = [...new Set(rows.map((r) => r.circularPostId))];
  const [meta, events] = await Promise.all([
    db
      .select({
        postId: circularPosts.id,
        titleBn: circularPosts.titleBn,
        circularId: circulars.id,
        slug: circulars.slug,
        endAt: circulars.applicationEndAt,
        orgNameBn: organizations.nameBn,
        orgShort: organizations.shortName,
      })
      .from(circularPosts)
      .innerJoin(circulars, eq(circulars.id, circularPosts.circularId))
      .innerJoin(organizations, eq(organizations.id, circulars.organizationId))
      .where(inArray(circularPosts.id, postIds)),
    db
      .select()
      .from(applicationEvents)
      .where(inArray(applicationEvents.applicationId, rows.map((r) => r.id)))
      .orderBy(asc(applicationEvents.createdAt)),
  ]);
  const metaBy = new Map(meta.map((m) => [m.postId, m]));
  return rows
    .filter((r) => metaBy.has(r.circularPostId))
    .map((r) => {
      const m = metaBy.get(r.circularPostId)!;
      return {
        id: r.id,
        circularId: m.circularId,
        circularSlug: m.slug,
        postId: r.circularPostId,
        jobTitleBn: m.titleBn,
        organizationNameBn: m.orgNameBn,
        organizationShortName: m.orgShort,
        status: r.status,
        deadlineAt: m.endAt.toISOString(),
        examAt: r.examAt?.toISOString() ?? null,
        examVenue: r.examVenue,
        applicantRef: r.applicantRef,
        feePaid: r.feePaid,
        notes: r.notes,
        nextActionBn: NEXT_ACTION_BN[r.status] ?? null,
        events: events
          .filter((e) => e.applicationId === r.id)
          .map((e) => ({ id: e.id, applicationId: e.applicationId, fromStatus: e.fromStatus, toStatus: e.toStatus, note: e.note, createdAt: e.createdAt.toISOString() })),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        version: r.version,
      };
    });
}

async function ownApplication(ctx: Ctx, db: DbOrTx, id: string, mutation = false): Promise<AppRow> {
  const userId = requireUser(ctx.actor, "seeker.own", { mutation });
  const [row] = await db.select().from(applications).where(eq(applications.id, id));
  // Someone else's application → 404, never 403.
  if (!row || row.userId !== userId) throw new AppError("NOT_FOUND");
  return row;
}

export async function listApplications(ctx: Ctx, db: DbOrTx, filter: { status?: ApplicationStatus | "all" }): Promise<Application[]> {
  const userId = requireUser(ctx.actor);
  const rows = await db
    .select()
    .from(applications)
    .where(and(eq(applications.userId, userId), filter.status && filter.status !== "all" ? eq(applications.status, filter.status) : undefined))
    .orderBy(desc(applications.updatedAt));
  return hydrate(db, rows);
}

async function circularWindow(db: DbOrTx, postId: string) {
  const [row] = await db
    .select({ startAt: circulars.applicationStartAt, endAt: circulars.applicationEndAt })
    .from(circularPosts)
    .innerJoin(circulars, eq(circulars.id, circularPosts.circularId))
    .where(eq(circularPosts.id, postId));
  if (!row) throw new AppError("NOT_FOUND");
  return { startAt: row.startAt.toISOString(), endAt: row.endAt.toISOString() };
}

export async function createApplication(ctx: Ctx, tx: Tx, postId: string, status: ApplicationStatus = "saved"): Promise<Application> {
  const userId = requireUser(ctx.actor, "seeker.own", { mutation: true });
  const [post] = await tx
    .select({ id: circularPosts.id })
    .from(circularPosts)
    .innerJoin(circulars, eq(circulars.id, circularPosts.circularId))
    .where(and(eq(circularPosts.id, postId), isPublicCircular));
  if (!post) throw new AppError("NOT_FOUND");
  if (status !== "saved" && status !== "applied") throw new AppError("VALIDATION");

  // Unique (user_id, circular_post_id) backs this: a duplicate becomes a friendly DUPLICATE.
  const [row] = await tx.insert(applications).values({ userId, circularPostId: postId, status: "saved" }).returning();
  await tx.insert(applicationEvents).values({ applicationId: row.id, fromStatus: null, toStatus: "saved", actorId: userId, note: t("tracker.createdEvent") });
  if (status === "applied") {
    return moveStatus(ctx, tx, row, "applied", {});
  }
  return (await hydrate(tx, [row]))[0];
}

async function moveStatus(ctx: Ctx, tx: Tx, app: AppRow, to: ApplicationStatus, opts: { appliedAt?: string | null; examAt?: string | null }): Promise<Application> {
  const now = ctx.now();
  const window = await circularWindow(tx, app.circularPostId);
  const [last] = await tx
    .select()
    .from(applicationEvents)
    .where(eq(applicationEvents.applicationId, app.id))
    .orderBy(desc(applicationEvents.createdAt))
    .limit(1);
  const examAt = opts.examAt ?? app.examAt?.toISOString() ?? null;
  const check = canTransitionApplication(app.status, to, {
    now,
    startAt: window.startAt,
    endAt: window.endAt,
    appliedAt: opts.appliedAt ?? null,
    examAt,
    previousStatus: last?.fromStatus ?? null,
    lastTransitionAt: last?.createdAt.toISOString() ?? null,
  });
  if (!check.ok) throw new AppError("ILLEGAL_TRANSITION", { message_bn: check.message_bn, fields: { reason: check.reasonCode } });

  const isUndo = last?.fromStatus === to;
  const [row] = await tx
    .update(applications)
    .set({
      status: to,
      ...(to === "applied" && !isUndo ? { appliedAt: opts.appliedAt ? new Date(opts.appliedAt) : new Date(now) } : {}),
      ...(opts.examAt ? { examAt: new Date(opts.examAt) } : {}),
      version: sql`${applications.version} + 1`,
      updatedAt: new Date(now),
    })
    .where(and(eq(applications.id, app.id), eq(applications.version, app.version)))
    .returning();
  if (!row) throw new AppError("CONFLICT");
  await tx.insert(applicationEvents).values({
    applicationId: app.id,
    fromStatus: app.status,
    toStatus: to,
    actorId: ctx.actor.kind === "user" ? ctx.actor.userId : null,
    note: isUndo ? "আগের ধাপে ফেরানো হয়েছে" : null,
  });
  return (await hydrate(tx, [row]))[0];
}

/** Status changes go through the §4.2 machine and write an application_events row. */
export async function updateApplicationStatus(
  ctx: Ctx,
  tx: Tx,
  id: string,
  to: ApplicationStatus,
  version: number,
  opts: { appliedAt?: string | null; examAt?: string | null } = {},
): Promise<Application> {
  const app = await ownApplication(ctx, tx, id, true);
  if (app.version !== version) throw new AppError("CONFLICT");
  if (app.status === to) return (await hydrate(tx, [app]))[0];
  return moveStatus(ctx, tx, app, to, opts);
}

export async function updateApplication(ctx: Ctx, tx: Tx, id: string, patch: ApplicationPatch, version: number): Promise<Application> {
  const app = await ownApplication(ctx, tx, id, true);
  const [row] = await tx
    .update(applications)
    .set({
      ...(patch.applicantRef !== undefined ? { applicantRef: patch.applicantRef || null } : {}),
      ...(patch.feePaid !== undefined ? { feePaid: patch.feePaid } : {}),
      ...(patch.examAt !== undefined ? { examAt: patch.examAt ? new Date(patch.examAt) : null } : {}),
      ...(patch.examVenue !== undefined ? { examVenue: patch.examVenue || null } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      version: sql`${applications.version} + 1`,
      updatedAt: new Date(ctx.now()),
    })
    .where(and(eq(applications.id, app.id), eq(applications.version, version)))
    .returning();
  if (!row) throw new AppError("CONFLICT");
  return (await hydrate(tx, [row]))[0];
}

export async function deleteApplication(ctx: Ctx, tx: Tx, id: string): Promise<{ id: string }> {
  const app = await ownApplication(ctx, tx, id, true);
  await tx.delete(applications).where(eq(applications.id, app.id));
  return { id };
}
