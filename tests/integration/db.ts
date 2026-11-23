import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/server/db/schema";
import type { Db } from "@/server/db/client";

const root = process.cwd();

/** Split a Drizzle migration on its breakpoint markers. */
function statements(file: string): string[] {
  return readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function migrationFiles(): string[] {
  const dir = path.join(root, "drizzle");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => path.join(dir, f));
}

export type TestDb = { db: Db; exec: (sql: string) => Promise<void>; close: () => Promise<void> };

/**
 * A fresh, migrated database. Uses `TEST_DATABASE_URL` (CI's Postgres service) when set,
 * otherwise an in-process PGlite instance — real Postgres either way.
 */
export async function createTestDb(): Promise<TestDb> {
  const stub = readFileSync(path.join(root, "tests/integration/supabase-stub.sql"), "utf8");
  const url = process.env.TEST_DATABASE_URL;
  if (url) {
    const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
    const exec = async (q: string) => {
      await sql.unsafe(q);
    };
    await exec("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS auth CASCADE;");
    await exec(stub);
    for (const f of migrationFiles()) for (const s of statements(f)) await exec(s);
    const db = drizzlePg(sql, { schema, casing: "snake_case" }) as unknown as Db;
    return { db, exec, close: () => sql.end() };
  }
  const client = new PGlite({ extensions: { pg_trgm, pgcrypto } });
  const exec = async (q: string) => {
    await client.exec(q);
  };
  await exec(stub);
  for (const f of migrationFiles()) for (const s of statements(f)) await exec(s);
  const db = drizzlePglite(client, { schema, casing: "snake_case" }) as unknown as Db;
  return { db, exec, close: () => client.close() };
}
