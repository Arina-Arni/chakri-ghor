import { NextResponse } from "next/server";
import { cronAuthorized } from "@/server/api/cron";
import { getDb } from "@/server/db/client";
import { drainOutbox } from "@/server/email/outbox";
import { mailer } from "@/server/email/mailer";
import { renderEmail } from "@/server/email/templates";
import { runWorker } from "@/server/services/workflows";

export const maxDuration = 60;

/** Every minute (pg_cron + pg_net): due workflow steps, then the email outbox. */
async function handle(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const db = getDb();
  const steps = await runWorker(db, { limit: 40 });
  const emails = await drainOutbox(db, mailer(), (t, p) => renderEmail(t, p));
  return NextResponse.json({ ok: true, steps, emails }, { headers: { "cache-control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
