import { describe, expect, it } from "vitest";
import {
  FREE,
  GRACE_MS,
  SUB_EDGES,
  TRIAL_MS,
  advance,
  applyPayment,
  canMoveSubscription,
  effectivePlan,
  expiringSoon,
  setCancel,
  startTrial,
  type SubStatus,
} from "@/domain/state-machines/subscription";

const NOW = Date.parse("2026-11-23T06:00:00Z");
const DAY = 86_400_000;

describe("subscription state machine", () => {
  const all = Object.keys(SUB_EDGES) as SubStatus[];
  for (const from of all) for (const to of all) {
    it(`${from} → ${to} ${SUB_EDGES[from].includes(to) ? "allowed" : "refused"}`, () => {
      expect(canMoveSubscription(from, to)).toBe(SUB_EDGES[from].includes(to));
    });
  }

  it("trial only once, premium during the trial, free after it", () => {
    const t = startTrial(FREE, NOW);
    if (!t.ok) throw new Error();
    expect(effectivePlan(t.state, NOW + DAY)).toBe("premium");
    expect(startTrial(t.state, NOW)).toMatchObject({ ok: false, reasonCode: "TRIAL_USED" });
    expect(advance(t.state, NOW + TRIAL_MS).status).toBe("expired");
    expect(effectivePlan(t.state, NOW + TRIAL_MS)).toBe("free");
  });

  it("active → past_due → grace (3 days, still premium) → expired", () => {
    const a = applyPayment(FREE, NOW, 30 * DAY);
    if (!a.ok) throw new Error();
    const end = NOW + 30 * DAY;
    const g = advance(a.state, end);
    expect(g.status).toBe("grace");
    expect(g.graceEndsAt).toBe(end + GRACE_MS);
    expect(effectivePlan(a.state, end + DAY)).toBe("premium");
    expect(advance(a.state, end + GRACE_MS).status).toBe("expired");
    expect(effectivePlan(a.state, end + GRACE_MS)).toBe("free");
  });

  it("cancel at period end expires instead of going to grace", () => {
    const a = applyPayment(FREE, NOW, 30 * DAY);
    if (!a.ok) throw new Error();
    const c = setCancel(a.state, true);
    if (!c.ok) throw new Error();
    expect(advance(c.state, NOW + 30 * DAY).status).toBe("expired");
  });

  it("payment from expired reactivates; payment while active extends from the period end", () => {
    const expired = { ...FREE, status: "expired" as const, trialUsed: true };
    const r = applyPayment(expired, NOW, DAY);
    expect(r.ok && r.state.status).toBe("active");
    if (!r.ok) throw new Error();
    const again = applyPayment(r.state, NOW + 1000, DAY);
    expect(again.ok && again.state.currentPeriodEnd).toBe(NOW + 2 * DAY);
  });

  it("advance is idempotent", () => {
    const a = applyPayment(FREE, NOW, DAY);
    if (!a.ok) throw new Error();
    const once = advance(a.state, NOW + 2 * DAY);
    expect(advance(once, NOW + 2 * DAY)).toEqual(once);
  });

  it("expiring soon = ends within 24 h", () => {
    const a = applyPayment(FREE, NOW, DAY);
    if (!a.ok) throw new Error();
    expect(expiringSoon(a.state, NOW + 1000)).toBe(true);
    expect(expiringSoon(a.state, NOW - 2 * DAY)).toBe(false);
  });
});
