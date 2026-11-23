import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./db";

let t: TestDb;

/** Rows from db.execute() — postgres.js returns an array, PGlite an object with `rows`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rows = (r: unknown): any[] => (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? []));

beforeAll(async () => {
  t = await createTestDb();
}, 120_000);
afterAll(async () => {
  await t?.close();
});

describe("migrations", () => {
  it("create the tables and extensions", async () => {
    const r = await t.db.execute(sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`);
    expect(Number(rows(r)[0].n)).toBeGreaterThanOrEqual(31);
    const ext = await t.db.execute(sql`select extname from pg_extension where extname in ('pg_trgm','pgcrypto')`);
    expect(rows(ext).length).toBe(2);
  });

  it("create a profile when an auth user signs up", async () => {
    await t.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-8000-000000000001', 'a@x.test', '{"full_name":"রহিমা"}')`);
    const r = await t.db.execute(sql`select full_name, role from profiles where user_id = '00000000-0000-4000-8000-000000000001'`);
    expect(rows(r)[0]).toMatchObject({ full_name: "রহিমা", role: "seeker" });
  });

  it("make audit_logs append-only", async () => {
    await t.exec(`insert into audit_logs (actor_role, action, entity_type, entity_id) values ('admin','x','user','1')`);
    await expect(t.exec(`update audit_logs set action = 'y'`)).rejects.toThrow(/append-only/);
    await expect(t.exec(`delete from audit_logs`)).rejects.toThrow(/append-only/);
  });

  it("enable RLS on every public table", async () => {
    const r = await t.db.execute(sql`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(rows(r)).toEqual([]);
  });
});
