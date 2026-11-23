import "server-only";
import { and, eq, gt, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { formatDateTimeBn } from "@/domain/bn";
import { advance, expiringSoon } from "@/domain/state-machines/subscription";
import type { DbOrTx } from "@/server/db/client";
import {
  aiCache,
  applications,
  auditLogs,
  bookmarks,
  circularPosts,
  circulars,
  faultInjections,
  idempotencyKeys,
  notifications,
  rateLimits,
  subscriptions,
} from "@/server/db/schema";
import { enqueueEmails } from "@/server/email/outbox";
import { subStateOf } from "@/server/quota";

const H = 3_600_000;
export const REMINDER_THRESHOLDS_H = [72, 24, 3] as const;

type NoteValue = typeof notifications.$inferInsert;

async function insertNotes(db: DbOrTx, rows: NoteValue[]): Promise<number> {
  if (!rows.length) return 0;
  const r = await db.insert(notifications).values(rows).onConflictDoNothing({ target: notifications.dedupeKey }).returning({ id: notifications.id });
  return r.length;
}

/** The tightest threshold already reached (e.g. 20 h left → 24 h). */
function threshold(msLeft: number): number | null {
  const hit = [...REMINDER_THRESHOLDS_H].reverse().find((h) => msLeft <= h * H);
  return hit ?? null;
}

/**
 * Deadline reminders 72 h / 24 h / 3 h before the end for tracked items not yet applied
 * (saved / preparing) and bookmarks that are not tracked.
 * dedupe_key = deadline:{applicationId|bookmarkId}:{threshold}
 */
export async function deadlineReminders(db: DbOrTx, now: number): Promise<number> {
  const horizon = new Date(now + 72 * H);
  const apps = await db
    .select({ id: applications.id, userId: applications.userId, endAt: circulars.applicationEndAt, slug: circulars.slug, title: circularPosts.titleBn })
    .from(applications)
    .innerJoin(circularPosts, eq(circularPosts.id, applications.circularPostId))
    .innerJoin(circulars, eq(circulars.id, circularPosts.circularId))
    .where(and(inArray(applications.status, ["saved", "preparing"]), gt(circulars.applicationEndAt, new Date(now)), lte(circulars.applicationEndAt, horizon), inArray(circulars.status, ["published"])));
  const bms = await db
    .select({ id: bookmarks.id, userId: bookmarks.userId, postId: bookmarks.circularPostId, endAt: circulars.applicationEndAt, slug: circulars.slug, title: circularPosts.titleBn })
    .from(bookmarks)
    .innerJoin(circularPosts, eq(circularPosts.id, bookmarks.circularPostId))
    .innerJoin(circulars, eq(circulars.id, circularPosts.circularId))
    .leftJoin(applications, and(eq(applications.userId, bookmarks.userId), eq(applications.circularPostId, bookmarks.circularPostId)))
    .where(and(isNull(applications.id), gt(circulars.applicationEndAt, new Date(now)), lte(circulars.applicationEndAt, horizon), eq(circulars.status, "published")));
  const rows: NoteValue[] = [];
  for (const x of [...apps.map((a) => ({ ...a, key: a.id })), ...bms.map((b) => ({ ...b, key: `bm:${b.id}` }))]) {
    const th = threshold(x.endAt.getTime() - now);
    if (th == null) continue;
    rows.push({
      userId: x.userId,
      type: "deadline",
      title: `${th === 3 ? "৩ ঘণ্টা" : th === 24 ? "২৪ ঘণ্টা" : "৩ দিন"}-এর মধ্যে শেষ: ${x.title}`.slice(0, 200),
      body: `আবেদনের শেষ সময় ${formatDateTimeBn(x.endAt)}। এখনো আবেদন না করে থাকলে দেরি করবেন না।`,
      link: `/jobs/${x.slug}`,
      dedupeKey: `deadline:${x.key}:${th}`,
    });
  }
  return insertNotes(db, rows);
}

/** Exam reminder 1 day before exam_at. dedupe_key = exam:{applicationId}:{examAt} */
export async function examReminders(db: DbOrTx, now: number): Promise<number> {
  const due = await db
    .select({ id: applications.id, userId: applications.userId, examAt: applications.examAt, venue: applications.examVenue, title: circularPosts.titleBn })
    .from(applications)
    .innerJoin(circularPosts, eq(circularPosts.id, applications.circularPostId))
    .where(and(gt(applications.examAt, new Date(now)), lte(applications.examAt, new Date(now + 24 * H))));
  return insertNotes(
    db,
    due.map((a) => ({
      userId: a.userId,
      type: "exam" as const,
      title: `আগামীকাল পরীক্ষা: ${a.title}`.slice(0, 200),
      body: `${formatDateTimeBn(a.examAt!)}${a.venue ? ` · ${a.venue}` : ""}। প্রবেশপত্র সঙ্গে নিন।`,
      link: "/applications",
      dedupeKey: `exam:${a.id}:${a.examAt!.toISOString()}`,
    })),
  );
}

/** published → closed once the deadline passes (system transition, audit-logged). */
export async function autoClose(db: DbOrTx, now: number): Promise<number> {
  const closed = await db
    .update(circulars)
    .set({ status: "closed", closedAt: sql`${circulars.applicationEndAt}`, version: sql`${circulars.version} + 1`, updatedAt: new Date(now) })
    .where(and(eq(circulars.status, "published"), lte(circulars.applicationEndAt, new Date(now)), isNull(circulars.deletedAt)))
    .returning({ id: circulars.id });
  if (closed.length) {
    await db.insert(auditLogs).values(closed.map((c) => ({ actorId: null, actorRole: "system", action: "circular.auto_close", entityType: "circular", entityId: c.id, before: { status: "published" }, after: { status: "closed" }, requestId: "scheduler" })));
  }
  return closed.length;
}

/** Move subscriptions through past_due → grace → expired; notify 24 h before the end. */
export async function subscriptionJobs(db: DbOrTx, now: number): Promise<{ moved: number; notified: number }> {
  const rows = await db.select().from(subscriptions).where(inArray(subscriptions.status, ["trialing", "active", "past_due", "grace"]));
  let moved = 0;
  const notes: NoteValue[] = [];
  for (const r of rows) {
    const before = subStateOf(r);
    const after = advance(before, now);
    if (after.status !== before.status) {
      await db
        .update(subscriptions)
        .set({ status: after.status, planId: after.planCode, graceEndsAt: after.graceEndsAt != null ? new Date(after.graceEndsAt) : null, version: sql`${subscriptions.version} + 1`, updatedAt: new Date(now) })
        .where(and(eq(subscriptions.userId, r.userId), eq(subscriptions.status, r.status)));
      moved++;
    }
    if (expiringSoon(after, now) && !after.cancelAtPeriodEnd) {
      const end = after.status === "trialing" ? after.trialEndsAt : after.status === "grace" ? after.graceEndsAt : after.currentPeriodEnd;
      notes.push({
        userId: r.userId,
        type: "system",
        title: "প্রিমিয়ামের মেয়াদ শেষ হচ্ছে",
        body: `আপনার প্ল্যান ${formatDateTimeBn(end!)}-এ শেষ হবে। চালু রাখতে নবায়ন করুন।`,
        link: "/billing",
        dedupeKey: `subscription:${r.userId}:${after.status}:${end}`,
      });
    }
  }
  return { moved, notified: await insertNotes(db, notes) };
}

/** Expired idempotency keys, cache entries, fault injections and rate-limit windows. */
export async function cleanup(db: DbOrTx, now: number): Promise<number> {
  const day = new Date(now - 24 * H);
  const [a, b, c, d] = await Promise.all([
    db.delete(idempotencyKeys).where(lt(idempotencyKeys.createdAt, day)).returning({ id: idempotencyKeys.id }),
    db.delete(aiCache).where(lt(aiCache.expiresAt, new Date(now - 7 * 24 * H))).returning({ k: aiCache.key }),
    db.delete(faultInjections).where(lt(faultInjections.expiresAt, day)).returning({ id: faultInjections.id }),
    db.delete(rateLimits).where(lt(rateLimits.windowStart, day)).returning({ k: rateLimits.key }),
  ]);
  return a.length + b.length + c.length + d.length;
}

/** Every job; each is idempotent, so running twice creates nothing new. */
export async function runScheduler(db: DbOrTx, now = Date.now()) {
  const closed = await autoClose(db, now);
  const deadline = await deadlineReminders(db, now);
  const exam = await examReminders(db, now);
  const subs = await subscriptionJobs(db, now);
  const cleaned = await cleanup(db, now);
  const emails = await enqueueEmails(db, { since: new Date(now - 48 * H) });
  return { closed, deadline, exam, subscriptions: subs, cleaned, emailsQueued: emails };
}
