import { NextResponse } from "next/server";
import { cronAuthorized } from "@/server/api/cron";
import { getDb } from "@/server/db/client";
import { runScheduler } from "@/server/jobs/scheduler";

export const maxDuration = 60;

/** Every 15 minutes: reminders, auto-close, subscriptions, cleanup, email enqueue. Idempotent. */
async function handle(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const result = await runScheduler(getDb());
  return NextResponse.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
