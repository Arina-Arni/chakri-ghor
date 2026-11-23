import "server-only";
import { jsonb, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Read-only view of Supabase's `auth.users` (managed by Supabase, not by our migrations,
 * so it is kept out of `schema.ts`).
 */
const auth = pgSchema("auth");

export const authUsers = auth.table("users", {
  id: uuid().primaryKey(),
  email: text(),
  rawUserMetaData: jsonb("raw_user_meta_data"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }),
});
