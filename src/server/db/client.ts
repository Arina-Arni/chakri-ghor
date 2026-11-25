import "server-only";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "@/env";
import * as schema from "./schema";

type Schema = typeof schema;
/** Works for both the postgres.js driver (app) and PGlite (integration tests). */
export type Db = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type Tx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type DbOrTx = Db | Tx;

const globalForDb = globalThis as unknown as { __crDb?: Db; __crSql?: ReturnType<typeof postgres> };

let override: Db | null = null;

/** Tests swap in a PGlite-backed database. */
export function setDbForTests(db: Db | null): void {
  override = db;
}

/**
 * The app's database. Traffic goes through the Supabase pooler (transaction mode), which
 * does not support prepared statements — hence `prepare: false`.
 */
export function getDb(): Db {
  if (override) return override;
  if (globalForDb.__crDb) return globalForDb.__crDb;
  // max_pipeline: 1 — Supavisor (port 6543, transaction mode) hangs on pipelined queries: the
  //   server gets half a query and waits in "ClientRead" until statement_timeout (2 min), and
  //   the timeout error then lands on some later request. Parallel reads (Promise.all) made
  //   postgres.js pipeline, so login / getMe randomly hung for minutes.
  // query_timeout / connect_timeout — never wait minutes: fail in seconds and reconnect.
  // idle_timeout — a new TLS connection to the pooler costs ~1.5 s from Bangladesh, so keep
  //   connections for 5 minutes instead of 20 s.
  const sql = postgres(serverEnv().DATABASE_URL, {
    prepare: false,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    max_pipeline: 1,
    idle_timeout: 300,
    connect_timeout: 10,
    query_timeout: 30,
  });
  const db = drizzle(sql, { schema, casing: "snake_case" }) as unknown as Db;
  globalForDb.__crSql = sql;
  globalForDb.__crDb = db;
  return db;
}

export { schema };
