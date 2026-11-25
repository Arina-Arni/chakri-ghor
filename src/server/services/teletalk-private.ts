import "server-only";
import { parseTeletalkPrivateJobs, TELETALK_PRIVATE_LIST, type TeletalkPrivateList } from "@/domain/teletalk-private";
import { authorize } from "@/server/authz";
import type { Ctx } from "@/server/context";

/**
 * Staff check of Teletalk's public private-jobs list, shown on /admin/ingest. Nothing is imported
 * here: a moderator sends a listed job's PDF into the normal ingest workflow (AI extraction →
 * review → publish). Network problems return `available: false` instead of an error page.
 */
export async function listTeletalkPrivateJobs(ctx: Ctx): Promise<TeletalkPrivateList> {
  authorize(ctx.actor, "circular.moderate");
  const checkedAt = new Date(ctx.now()).toISOString();
  try {
    const res = await fetch(TELETALK_PRIVATE_LIST, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (!res.ok) return { available: false, checkedAt };
    return parseTeletalkPrivateJobs(await res.json(), checkedAt);
  } catch {
    return { available: false, checkedAt };
  }
}
