import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { circuitBreakers } from "@/server/db/schema";
import { outboxBacklog } from "@/server/email/outbox";
import { workflowBacklog } from "@/server/services/workflows";

/** Liveness and backlog: DB, breaker states, email outbox, workflow queue. No secrets. */
export async function GET() {
  const started = Date.now();
  try {
    const db = getDb();
    await db.execute(sql`select 1`);
    const [breakers, outbox, workflow] = await Promise.all([db.select({ name: circuitBreakers.name, state: circuitBreakers.state }).from(circuitBreakers), outboxBacklog(db), workflowBacklog(db)]);
    return NextResponse.json(
      { ok: true, db: { ok: true, latencyMs: Date.now() - started }, breakers, outbox: { backlog: outbox }, workflow },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false, db: { ok: false } }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
