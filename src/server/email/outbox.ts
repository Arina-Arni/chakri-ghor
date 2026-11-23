import "server-only";
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { authUsers } from "@/server/db/auth-schema";
import { emailOutbox, notificationPreferences, notifications } from "@/server/db/schema";

export type EmailTemplate = "deadline_reminder" | "new_match" | "deadline_extended" | "exam_reminder" | "subscription_expiring" | "generic";

/** Which template a notification uses (by type and dedupe key). */
export function templateFor(type: string, dedupeKey: string): EmailTemplate {
  if (dedupeKey.startsWith("extend:")) return "deadline_extended";
  if (dedupeKey.startsWith("subscription:")) return "subscription_expiring";
  if (type === "deadline") return "deadline_reminder";
  if (type === "new_match") return "new_match";
  if (type === "exam") return "exam_reminder";
  return "generic";
}

/**
 * Enqueue one outbox row per notification whose user has email enabled. Unique on
 * notification_id, so enqueuing twice is harmless. The in-app notification always exists.
 */
export async function enqueueEmails(db: DbOrTx, opts: { notificationIds?: string[]; since?: Date } = {}): Promise<number> {
  const rows = await db
    .select({ id: notifications.id, type: notifications.type, title: notifications.title, body: notifications.body, link: notifications.link, dedupe: notifications.dedupeKey, email: authUsers.email })
    .from(notifications)
    .innerJoin(authUsers, eq(authUsers.id, notifications.userId))
    .leftJoin(notificationPreferences, eq(notificationPreferences.userId, notifications.userId))
    .leftJoin(emailOutbox, eq(emailOutbox.notificationId, notifications.id))
    .where(
      and(
        isNull(emailOutbox.id),
        sql`coalesce(${notificationPreferences.emailEnabled}, true)`,
        opts.notificationIds ? (opts.notificationIds.length ? inArray(notifications.id, opts.notificationIds) : sql`false`) : undefined,
        opts.since ? sql`${notifications.createdAt} >= ${opts.since.toISOString()}::timestamptz` : undefined,
      ),
    )
    .limit(1000);
  const values = rows
    .filter((r) => r.email)
    .map((r) => ({ notificationId: r.id, toEmail: r.email!, template: templateFor(r.type, r.dedupe), payload: { title: r.title, body: r.body, link: r.link } }));
  if (!values.length) return 0;
  const inserted = await db.insert(emailOutbox).values(values).onConflictDoNothing({ target: emailOutbox.notificationId }).returning({ id: emailOutbox.id });
  return inserted.length;
}

export type Mailer = { send(m: { to: string; subject: string; html: string; text: string }, signal: AbortSignal): Promise<{ id: string }> };

export const OUTBOX_MAX_ATTEMPTS = 5;

/**
 * Send due outbox rows: 10 s timeout per send, exponential backoff, `dead` after 5 attempts.
 * Rows are leased (SKIP LOCKED) so parallel workers never double-send.
 */
export async function drainOutbox(
  db: DbOrTx,
  mailer: Mailer | null,
  render: (template: EmailTemplate, payload: Record<string, unknown>) => Promise<{ subject: string; html: string; text: string }>,
  now = Date.now(),
  limit = 25,
): Promise<{ sent: number; failed: number; dead: number }> {
  const stats = { sent: 0, failed: 0, dead: 0 };
  if (!mailer) return stats;
  const nowIso = new Date(now).toISOString();
  const due = await db.transaction(async (tx) => {
    const r = await tx.execute<{ id: string }>(sql`
      select id from ${emailOutbox}
      where status in ('pending','failed') and next_attempt_at <= ${nowIso}::timestamptz
        and (lease_until is null or lease_until < ${nowIso}::timestamptz)
      order by next_attempt_at limit ${limit} for update skip locked`);
    const ids = ((Array.isArray(r) ? r : (r as { rows: { id: string }[] }).rows) as { id: string }[]).map((x) => x.id);
    if (ids.length) await tx.update(emailOutbox).set({ leaseUntil: new Date(now + 60_000) }).where(inArray(emailOutbox.id, ids));
    return ids;
  });
  for (const id of due) {
    const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id));
    if (!row) continue;
    const attempts = row.attempts + 1;
    try {
      const msg = await render(row.template as EmailTemplate, row.payload);
      const res = await mailer.send({ to: row.toEmail, ...msg }, AbortSignal.timeout(10_000));
      await db.update(emailOutbox).set({ status: "sent", attempts, providerMessageId: res.id, lastError: null, leaseUntil: null, updatedAt: new Date(now) }).where(eq(emailOutbox.id, id));
      stats.sent++;
    } catch (e) {
      const dead = attempts >= OUTBOX_MAX_ATTEMPTS;
      await db
        .update(emailOutbox)
        .set({
          status: dead ? "dead" : "failed",
          attempts,
          lastError: String((e as Error)?.message ?? e).slice(0, 300),
          nextAttemptAt: new Date(now + Math.min(3_600_000, 60_000 * 2 ** (attempts - 1))),
          leaseUntil: null,
          updatedAt: new Date(now),
        })
        .where(eq(emailOutbox.id, id));
      if (dead) stats.dead++;
      else stats.failed++;
    }
  }
  return stats;
}

export async function outboxBacklog(db: DbOrTx, now = Date.now()): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(emailOutbox)
    .where(and(or(eq(emailOutbox.status, "pending"), eq(emailOutbox.status, "failed")), lte(emailOutbox.nextAttemptAt, new Date(now + 3_600_000))));
  return Number(n);
}
