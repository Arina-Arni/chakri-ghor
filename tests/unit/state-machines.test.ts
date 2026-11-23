import { describe, expect, it } from "vitest";
import {
  APPLICATION_EDGES,
  CIRCULAR_EDGES,
  CIRCULAR_STATUSES,
  PIPELINE,
  actionPath,
  allowedCircularActions,
  canExtendDeadline,
  canTransitionApplication,
  canTransitionCircular,
  effectiveCircularStatus,
  type CircularTransitionCtx,
} from "@/domain/state-machines";
import { APPLICATION_STATUSES, type ApplicationStatus, type CircularStatus } from "@/types";

const NOW = Date.parse("2026-11-23T06:00:00Z");
const H = 3_600_000;
const DAY = 24 * H;
const iso = (ms: number) => new Date(ms).toISOString();

const circCtx = (over: Partial<CircularTransitionCtx> = {}): CircularTransitionCtx => ({
  role: "moderator",
  now: NOW,
  postCount: 2,
  startAt: iso(NOW - DAY),
  endAt: iso(NOW + 5 * DAY),
  organizationExists: true,
  organizationVerified: true,
  reason: "তথ্য অসম্পূর্ণ",
  newEndAt: iso(NOW + 10 * DAY),
  closedAt: iso(NOW - DAY),
  ...over,
});

/** Context in which every structural edge is also satisfiable. */
function ctxFor(from: CircularStatus, to: CircularStatus): CircularTransitionCtx {
  if (from === "published" && to === "closed") return circCtx({ endAt: iso(NOW - H) });
  if (from === "closed") return circCtx({ endAt: iso(NOW - DAY), closedAt: iso(NOW - DAY) });
  return circCtx();
}

describe("circular state machine — every pair", () => {
  for (const from of CIRCULAR_STATUSES) {
    for (const to of CIRCULAR_STATUSES) {
      const legal = CIRCULAR_EDGES[from].includes(to);
      it(`${from} → ${to} is ${legal ? "legal" : "illegal"}`, () => {
        const r = canTransitionCircular(from, to, ctxFor(from, to));
        expect(r.ok).toBe(legal);
        if (!legal && !r.ok) expect(r.reasonCode).toBe("ILLEGAL_EDGE");
      });
    }
  }
});

describe("circular business rules", () => {
  it("seekers and guests cannot moderate", () => {
    expect(canTransitionCircular("pending_review", "published", circCtx({ role: "seeker" }))).toMatchObject({ ok: false, reasonCode: "FORBIDDEN" });
    expect(canTransitionCircular("draft", "pending_review", circCtx({ role: "guest" }))).toMatchObject({ ok: false, reasonCode: "FORBIDDEN" });
  });
  it("rejection needs a reason", () => {
    expect(canTransitionCircular("pending_review", "rejected", circCtx({ reason: "  " }))).toMatchObject({ ok: false, reasonCode: "REASON_REQUIRED" });
  });
  it("publishing needs posts, a future deadline after the start, and an organization", () => {
    expect(canTransitionCircular("pending_review", "published", circCtx({ postCount: 0 }))).toMatchObject({ reasonCode: "NO_POSTS" });
    expect(canTransitionCircular("pending_review", "published", circCtx({ endAt: iso(NOW - 1) }))).toMatchObject({ reasonCode: "DEADLINE_PASSED" });
    expect(canTransitionCircular("pending_review", "published", circCtx({ startAt: iso(NOW + 9 * DAY) }))).toMatchObject({ reasonCode: "END_BEFORE_START" });
    expect(canTransitionCircular("pending_review", "published", circCtx({ organizationExists: false }))).toMatchObject({ reasonCode: "NO_ORGANIZATION" });
  });
  it("only an admin publishes for an unverified organization", () => {
    expect(canTransitionCircular("pending_review", "published", circCtx({ organizationVerified: false }))).toMatchObject({ reasonCode: "ORG_UNVERIFIED" });
    expect(canTransitionCircular("pending_review", "published", circCtx({ organizationVerified: false, role: "admin" })).ok).toBe(true);
  });
  it("published → closed only after the deadline", () => {
    expect(canTransitionCircular("published", "closed", circCtx())).toMatchObject({ reasonCode: "STILL_OPEN" });
  });
  it("reads see a passed deadline as closed", () => {
    expect(effectiveCircularStatus("published", iso(NOW - 1), NOW)).toBe("closed");
    expect(effectiveCircularStatus("published", iso(NOW + 1), NOW)).toBe("published");
    expect(effectiveCircularStatus("draft", iso(NOW - 1), NOW)).toBe("draft");
  });
});

describe("deadline extension", () => {
  it("works for published and recently closed circulars", () => {
    expect(canExtendDeadline("published", circCtx()).ok).toBe(true);
    expect(canExtendDeadline("closed", circCtx({ endAt: iso(NOW - 29 * DAY), closedAt: iso(NOW - 29 * DAY) })).ok).toBe(true);
  });
  it("is refused more than 30 days after closing", () => {
    expect(canExtendDeadline("closed", circCtx({ endAt: iso(NOW - 31 * DAY), closedAt: iso(NOW - 31 * DAY) }))).toMatchObject({ reasonCode: "EXTENSION_WINDOW" });
  });
  it("requires a later, future end", () => {
    expect(canExtendDeadline("published", circCtx({ newEndAt: iso(NOW + 5 * DAY) }))).toMatchObject({ reasonCode: "NEW_END_NOT_LATER" });
    expect(canExtendDeadline("closed", circCtx({ endAt: iso(NOW - 3 * DAY), closedAt: iso(NOW - 3 * DAY), newEndAt: iso(NOW - DAY) }))).toMatchObject({ reasonCode: "NEW_END_PAST" });
    expect(canExtendDeadline("draft", circCtx())).toMatchObject({ reasonCode: "ILLEGAL_EDGE" });
  });
});

describe("admin actions map onto legal edges", () => {
  it("every action path is made of legal single steps", () => {
    for (const from of CIRCULAR_STATUSES) {
      for (const action of allowedCircularActions(from)) {
        const path = actionPath(action, from)!;
        let cur = from;
        for (const next of path) {
          expect(CIRCULAR_EDGES[cur]).toContain(next);
          cur = next;
        }
      }
    }
  });
  it("offers no actions on terminal statuses", () => {
    expect(allowedCircularActions("archived")).toEqual([]);
    expect(allowedCircularActions("cancelled")).toEqual([]);
  });
});

// ───────── application tracker ─────────

const appCtx = {
  now: NOW,
  startAt: iso(NOW - 2 * DAY),
  endAt: iso(NOW + 5 * DAY),
  examAt: iso(NOW + 20 * DAY),
};

describe("application state machine — every pair (forward)", () => {
  for (const from of APPLICATION_STATUSES) {
    for (const to of APPLICATION_STATUSES) {
      if (from === to) continue;
      const legal = APPLICATION_EDGES[from].includes(to);
      it(`${from} → ${to} is ${legal ? "legal" : "illegal"}`, () => {
        expect(canTransitionApplication(from, to, appCtx).ok).toBe(legal);
      });
    }
  }
});

describe("application rules", () => {
  it("rejects illegal jumps with a Bangla reason", () => {
    const r = canTransitionApplication("saved", "selected", appCtx);
    expect(r).toMatchObject({ ok: false, reasonCode: "ILLEGAL_JUMP" });
    if (!r.ok) expect(r.message_bn).toContain("পরের ধাপ");
  });
  it("terminal statuses never move", () => {
    for (const from of ["selected", "rejected", "withdrawn"] as ApplicationStatus[]) {
      expect(canTransitionApplication(from, "saved", appCtx)).toMatchObject({ ok: false, reasonCode: "TERMINAL" });
    }
  });
  it("cannot apply before the window opens", () => {
    expect(canTransitionApplication("saved", "applied", { ...appCtx, startAt: iso(NOW + DAY) })).toMatchObject({ reasonCode: "NOT_STARTED" });
  });
  it("after the deadline only when applied_at ≤ deadline", () => {
    const closed = { ...appCtx, endAt: iso(NOW - DAY) };
    expect(canTransitionApplication("preparing", "applied", closed)).toMatchObject({ reasonCode: "AFTER_DEADLINE" });
    expect(canTransitionApplication("preparing", "applied", { ...closed, appliedAt: iso(NOW - 2 * DAY + H) }).ok).toBe(true);
  });
  it("exam_scheduled requires exam_at", () => {
    expect(canTransitionApplication("admit_card", "exam_scheduled", { ...appCtx, examAt: null })).toMatchObject({ reasonCode: "EXAM_AT_REQUIRED" });
  });
  it("one step back is allowed within 24 h (undo), not later and not two steps", () => {
    const base = { ...appCtx, previousStatus: "applied" as const };
    expect(canTransitionApplication("admit_card", "applied", { ...base, lastTransitionAt: iso(NOW - H) }).ok).toBe(true);
    expect(canTransitionApplication("admit_card", "applied", { ...base, lastTransitionAt: iso(NOW - 25 * H) })).toMatchObject({ reasonCode: "UNDO_EXPIRED" });
    expect(canTransitionApplication("exam_scheduled", "applied", { ...base, lastTransitionAt: iso(NOW - H) })).toMatchObject({ ok: false });
  });
  it("pipeline order matches the status list", () => {
    expect(PIPELINE).toEqual(APPLICATION_STATUSES.slice(0, 8));
  });
});
