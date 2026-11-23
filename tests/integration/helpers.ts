import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { setDbForTests } from "@/server/db/client";
import type { Actor, Ctx } from "@/server/context";
import { invalidateAdminDashboard } from "@/server/services/dashboards";
import { seed, type DemoUser } from "../../scripts/seed/seed";
import { createTestDb, type TestDb } from "./db";

export type World = TestDb & {
  now: number;
  ids: { seeker: string; moderator: string; admin: string; other: string };
  ctx: (who: keyof World["ids"] | "guest", opts?: { now?: number }) => Ctx;
};

const USERS: DemoUser[] = [
  { role: "seeker", email: "seeker@test.local", fullName: "রহিমা আক্তার", password: "x" },
  { role: "moderator", email: "mod@test.local", fullName: "তানভীর হাসান", password: "x" },
  { role: "admin", email: "admin@test.local", fullName: "নুসরাত জাহান", password: "x" },
];

/** A migrated, seeded database plus a second seeker ("other") for IDOR tests. */
export async function createWorld(): Promise<World> {
  const t = await createTestDb();
  setDbForTests(t.db);
  invalidateAdminDashboard();
  const now = Date.now();
  const ensureAuthUser = async (u: DemoUser) => {
    const id = randomUUID();
    await t.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${u.email}', '{"full_name":"x"}')`);
    return id;
  };
  const result = await seed(t.db, { now, users: USERS, ensureAuthUser });
  const other = await ensureAuthUser({ role: "seeker", email: "other@test.local", fullName: "অন্য", password: "x" });
  await t.db.execute(sql`update profiles set full_name = 'অন্য প্রার্থী', onboarding_step = 4, onboarding_completed_at = now() where user_id = ${other}`);

  const ids = { seeker: result.users.seeker, moderator: result.users.moderator, admin: result.users.admin, other };
  const roleOf = { seeker: "seeker", moderator: "moderator", admin: "admin", other: "seeker" } as const;
  const emailOf = { seeker: "seeker@test.local", moderator: "mod@test.local", admin: "admin@test.local", other: "other@test.local" } as const;
  const ctx: World["ctx"] = (who, opts = {}) => {
    const actor: Actor = who === "guest" ? { kind: "guest" } : { kind: "user", userId: ids[who], role: roleOf[who], status: "active", email: emailOf[who] };
    return {
      actor,
      requestId: "REQ-TEST",
      ipHash: "iphash",
      userAgent: "vitest",
      visitorKey: who === "guest" ? "ip:iphash" : `u:${ids[who as keyof typeof ids]}`,
      now: () => opts.now ?? now,
    };
  };
  return { ...t, now, ids, ctx };
}

export function key(): string {
  return `test-${randomUUID()}`;
}

/** Rows from db.execute() — postgres.js returns an array, PGlite an object with `rows`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const rows = (r: unknown): any[] => (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? []));

/** Run and expect an AppError with this code. */
export async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  try {
    await p;
  } catch (e) {
    // Same mapping the API boundary (act / route handlers) applies.
    const { toAppError } = await import("@/server/errors");
    const c = toAppError(e).code;
    if (c === code) return;
    throw new Error(`Expected ${code}, got ${c ?? String(e)}`);
  }
  throw new Error(`Expected ${code}, but it succeeded`);
}
