/**
 * `npm run db:local` — a throwaway, migrated and seeded Postgres (PGlite) on
 * postgres://postgres@localhost:5433/postgres, for trying the app without Supabase
 * (public pages and reads; sign-in needs a real Supabase project).
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/server/db/schema";
import type { Db } from "@/server/db/client";
import { migrationFiles } from "../tests/integration/db";
import { seed } from "./seed/seed";

async function main() {
  const port = Number(process.env.PORT ?? 5433);
  const pg = new PGlite({ extensions: { pg_trgm, pgcrypto } });
  await pg.exec(readFileSync("tests/integration/supabase-stub.sql", "utf8"));
  for (const f of migrationFiles()) {
    for (const stmt of readFileSync(f, "utf8").split("--> statement-breakpoint").map((x) => x.trim()).filter(Boolean)) await pg.exec(stmt);
  }
  const db = drizzle(pg, { schema, casing: "snake_case" }) as unknown as Db;
  const r = await seed(db, {
    now: Date.now(),
    users: [
      { role: "seeker", email: "seeker@local.test", fullName: "রহিমা আক্তার", password: "-" },
      { role: "moderator", email: "mod@local.test", fullName: "তানভীর হাসান", password: "-" },
      { role: "admin", email: "admin@local.test", fullName: "নুসরাত জাহান", password: "-" },
    ],
    ensureAuthUser: async (u) => {
      const id = randomUUID();
      await pg.query("insert into auth.users (id, email) values ($1, $2)", [id, u.email]);
      return id;
    },
  });
  const server = new PGLiteSocketServer({ db: pg, port, host: "127.0.0.1" });
  await server.start();
  console.log(`Local Postgres ready on postgres://postgres@127.0.0.1:${port}/postgres — ${r.circulars} circulars, ${r.posts} posts.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
