/**
 * `npm run db:cron` — schedules the worker (every minute) and scheduler (every 15 minutes) in
 * Supabase pg_cron, calling the deployed APP_URL with CRON_SECRET. Enable the pg_cron and
 * pg_net extensions first (Database → Extensions). Re-running updates the jobs.
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
config();

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  const appUrl = process.env.APP_URL;
  const secret = process.env.CRON_SECRET;
  if (!url || !appUrl || !secret || secret.length < 16) throw new Error("Need DIRECT_URL/DATABASE_URL, APP_URL and CRON_SECRET (16+ chars)");
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  const [row] = await sql<{ r: string }[]>`select public.schedule_chakri_cron(${appUrl}, ${secret}) as r`;
  console.log(row.r);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
