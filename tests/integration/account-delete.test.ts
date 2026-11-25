import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorld, rows, type World } from "./helpers";

let w: World;

beforeAll(async () => {
  w = await createWorld();
}, 180_000);
afterAll(async () => {
  await w?.close();
});

const one = async (q: ReturnType<typeof sql>) => rows(await w.db.execute(q))[0];

describe("account deletion vs. append-only application_events", () => {
  it("keeps another user's history but clears the deleted actor", async () => {
    const app = await one(sql`select id from applications where user_id = ${w.ids.seeker} limit 1`);
    await w.db.execute(sql`insert into application_events (application_id, to_status, actor_id, note) values (${app.id}, 'saved', ${w.ids.moderator}, 'moderator note')`);

    await w.exec(`delete from auth.users where id = '${w.ids.moderator}'`);

    const ev = await one(sql`select actor_id, note from application_events where note = 'moderator note'`);
    expect(ev).toMatchObject({ actor_id: null, note: "moderator note" });
  });

  it("works for a user whose own tracker history has events", async () => {
    const id = w.ids.seeker;
    const before = await one(sql`select count(*)::int n from application_events where actor_id = ${id}`);
    expect(Number(before.n)).toBeGreaterThan(0);

    await w.exec(`delete from auth.users where id = '${id}'`);

    const left = await one(sql`select (select count(*)::int from profiles where user_id = ${id}) p,
      (select count(*)::int from applications where user_id = ${id}) a,
      (select count(*)::int from application_events where actor_id = ${id}) e`);
    expect(left).toMatchObject({ p: 0, a: 0, e: 0 });
  });

  it("still refuses every other change to application_events", async () => {
    const other = w.ids.other;
    await w.db.execute(sql`insert into applications (user_id, circular_post_id) select ${other}, id from circular_posts limit 1`);
    const mine = await one(sql`select id from applications where user_id = ${other} limit 1`);
    await w.db.execute(sql`insert into application_events (application_id, to_status, actor_id) values (${mine.id}, 'saved', ${other})`);
    await expect(w.exec(`update application_events set note = 'edited' where actor_id = '${other}'`)).rejects.toThrow(/append-only/);
    // Clearing the actor together with any other column is refused too.
    await expect(w.exec(`update application_events set actor_id = null, note = 'x' where actor_id = '${other}'`)).rejects.toThrow(/append-only/);
    await expect(w.exec(`update application_events set to_status = 'applied' where actor_id = '${other}'`)).rejects.toThrow(/append-only/);
  });
});
