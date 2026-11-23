import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Notification, NotificationType } from "@/types";
import { requireUser } from "@/server/authz";
import type { Ctx } from "@/server/context";
import type { DbOrTx, Tx } from "@/server/db/client";
import { bookmarks, circularPosts, notifications } from "@/server/db/schema";

function toNotification(n: typeof notifications.$inferSelect): Notification {
  return {
    id: n.id,
    type: n.type,
    titleBn: n.title,
    bodyBn: n.body,
    href: n.link,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}

export async function listNotifications(ctx: Ctx, db: DbOrTx): Promise<Notification[]> {
  const userId = requireUser(ctx.actor);
  const rows = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(100);
  return rows.map(toNotification);
}

export async function unreadCount(db: DbOrTx, userId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(n);
}

export async function markNotificationsRead(ctx: Ctx, tx: Tx, ids: string[] | "all"): Promise<{ updated: number }> {
  const userId = requireUser(ctx.actor, "seeker.own", { mutation: true });
  if (ids !== "all" && ids.length === 0) return { updated: 0 };
  const rows = await tx
    .update(notifications)
    .set({ readAt: new Date(ctx.now()), updatedAt: new Date(ctx.now()) })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), ids === "all" ? undefined : inArray(notifications.id, ids)))
    .returning({ id: notifications.id });
  return { updated: rows.length };
}

/**
 * Notify everyone who bookmarked any post of a circular. `dedupeKey` makes repeats a no-op,
 * so the same event never notifies a user twice.
 */
export async function notifyBookmarkers(
  tx: Tx,
  circularId: string,
  n: { type: NotificationType; title: string; body: string; link: string; dedupe: string },
): Promise<number> {
  const users = await tx
    .selectDistinct({ userId: bookmarks.userId })
    .from(bookmarks)
    .innerJoin(circularPosts, eq(circularPosts.id, bookmarks.circularPostId))
    .where(eq(circularPosts.circularId, circularId));
  if (users.length === 0) return 0;
  const inserted = await tx
    .insert(notifications)
    .values(
      users.map((u) => ({
        userId: u.userId,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        dedupeKey: `${n.dedupe}:${u.userId}`,
      })),
    )
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning({ id: notifications.id });
  return inserted.length;
}
