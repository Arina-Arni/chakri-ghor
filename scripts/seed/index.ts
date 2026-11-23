/**
 * `npm run db:seed` — seeds the database in DATABASE_URL (idempotent).
 * Demo users are created through the Supabase admin API; their passwords are written to the
 * git-ignored `.seed-credentials.local.md`, never to the repo.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/server/db/schema";
import type { Db } from "@/server/db/client";
import { seed, type DemoUser } from "./seed";

config({ path: ".env.local" });
config();

const CREDENTIALS = ".seed-credentials.local.md";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} (see .env.example)`);
  return v;
}

function loadPasswords(): Record<string, string> {
  if (!existsSync(CREDENTIALS)) return {};
  const out: Record<string, string> = {};
  for (const m of readFileSync(CREDENTIALS, "utf8").matchAll(/^\| (\S+@\S+) \| (\S+) \|/gm)) out[m[1]] = m[2];
  return out;
}

async function main() {
  const url = process.env.DIRECT_URL || need("DATABASE_URL");
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  const db = drizzle(sql, { schema, casing: "snake_case" }) as unknown as Db;
  const supabase = createClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

  const saved = loadPasswords();
  const pw = (email: string) => saved[email] ?? `Cr-${randomBytes(9).toString("base64url")}1`;
  const users: DemoUser[] = [
    { role: "seeker", email: "seeker.demo@chakri-radar.app", fullName: "রহিমা আক্তার", password: "" },
    { role: "moderator", email: "moderator.demo@chakri-radar.app", fullName: "তানভীর হাসান", password: "" },
    { role: "admin", email: "admin.demo@chakri-radar.app", fullName: "নুসরাত জাহান", password: "" },
  ].map((u) => ({ ...(u as DemoUser), password: pw(u.email) }));

  const ensureAuthUser = async (u: DemoUser): Promise<string> => {
    const [row] = await sql<{ id: string }[]>`select id from auth.users where email = ${u.email}`;
    if (row) {
      await supabase.auth.admin.updateUserById(row.id, { password: u.password, email_confirm: true, user_metadata: { full_name: u.fullName } });
      return row.id;
    }
    const { data, error } = await supabase.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true, user_metadata: { full_name: u.fullName } });
    if (error || !data.user) throw new Error(`Could not create ${u.email}: ${error?.message}`);
    return data.user.id;
  };

  const uploadSamplePdf = async (): Promise<string | null> => {
    const bucket = "circular-pdfs";
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b) => b.name === bucket)) {
      const { error } = await supabase.storage.createBucket(bucket, { public: false, fileSizeLimit: 15 * 1024 * 1024, allowedMimeTypes: ["application/pdf"] });
      if (error) return null;
    }
    const path = "samples/sample-notice.pdf";
    const { error } = await supabase.storage.from(bucket).upload(path, readFileSync("public/sample-notice.pdf"), { contentType: "application/pdf", upsert: true });
    return error ? null : path;
  };

  const result = await seed(db, { now: Date.now(), users, ensureAuthUser, uploadSamplePdf });

  writeFileSync(
    CREDENTIALS,
    [
      "# Demo accounts (local only — git-ignored, never commit)",
      "",
      "| Email | Password | Role |",
      "|---|---|---|",
      ...users.map((u) => `| ${u.email} | ${u.password} | ${u.role} |`),
      "",
    ].join("\n"),
  );
  console.log(`Seeded ${result.circulars} circulars / ${result.posts} posts and ${users.length} demo users. Credentials: ${CREDENTIALS}`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
