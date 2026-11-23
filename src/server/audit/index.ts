import "server-only";
import type { DbOrTx } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";
import type { Ctx } from "@/server/context";

export type AuditEntry = {
  action: string;
  entityType: "circular" | "organization" | "user" | "settings" | "workflow_run" | "account";
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

/** Append one row to the audit log (inside the caller's transaction). */
export async function writeAudit(tx: DbOrTx, ctx: Ctx, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLogs).values({
    actorId: ctx.actor.kind === "user" ? ctx.actor.userId : null,
    actorRole: ctx.actor.kind === "user" ? ctx.actor.role : "guest",
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ipHash: ctx.ipHash,
    userAgent: ctx.userAgent?.slice(0, 300) ?? null,
    requestId: ctx.requestId,
  });
}
