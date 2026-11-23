/**
 * `npm run db:migrate` — applies drizzle/*.sql over DIRECT_URL (used locally, in CI and for
 * production). Drizzle's migrator records applied files in drizzle.__drizzle_migrations.
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: ".env.local" });
config();

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DIRECT_URL / DATABASE_URL (see .env.example)");
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
