import { beforeAll, describe, expect, it } from "vitest";
import {
  createApplication,
  getAiHealth,
  getCircular,
  getFacets,
  getZeroResultSuggestions,
  listApplications,
  listCirculars,
  listResumes,
  listWorkflowRuns,
  parseSearchQuery,
  setRole,
  updateApplicationStatus,
} from "@/data";
import { getDb } from "@/data/fixtures/db";
import { displayStatus } from "@/domain/status";
import { APPLICATION_STATUSES } from "@/types";

const H = 3_600_000;

describe("fixtures cover every state (spec §9)", () => {
  const db = getDb();
  const now = Date.now();
  const left = (slug: string) => new Date(db.circulars.find((c) => c.slug === slug)!.endAt).getTime() - now;

  it("has deadlines at every distance", () => {
    expect(left("dc-khulna-office-assistant-2026")).toBeLessThanOrEqual(2 * H);
    expect(left("dpe-assistant-teacher-2026")).toBeLessThan(12 * H);
    expect(left("railway-khalashi-2026")).toBeGreaterThan(24 * H);
    expect(left("railway-khalashi-2026")).toBeLessThan(48 * H);
    expect(left("bsc-senior-officer-2026")).toBeGreaterThan(5 * 24 * H);
    const statuses = db.circulars.filter((c) => c.status === "published").map((c) => displayStatus(c, now));
    expect(statuses).toEqual(expect.arrayContaining(["upcoming", "open", "closing_soon", "closed"]));
  });
  it("has multi-post, missing salary, extended and unverified cases", () => {
    expect(db.circulars.some((c) => c.posts.length > 1)).toBe(true);
    expect(db.circulars.some((c) => c.posts.every((p) => p.salaryMin == null && p.salaryMax == null))).toBe(true);
    expect(db.circulars.some((c) => c.originalEndAt)).toBe(true);
    expect(db.organizations.some((o) => !o.verified)).toBe(true);
  });
  it("has applications in every status and resumes with high and low scores", () => {
    const seen = new Set(db.applications.map((a) => a.status));
    for (const s of APPLICATION_STATUSES) expect(seen.has(s)).toBe(true);
    const scores = db.resumes.map((r) => r.atsScore);
    expect(Math.max(...scores)).toBeGreaterThanOrEqual(85);
    expect(Math.min(...scores)).toBeLessThan(70);
  });
});

describe("discovery", () => {
  beforeAll(() => setRole("seeker"));

  it("lists open jobs, paginates and hides closed ones", async () => {
    const r = await listCirculars({});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.items.length).toBe(10);
    expect(r.data.nextCursor).toBe("10");
    expect(r.data.items.every((i) => new Date(i.endAt).getTime() > Date.now())).toBe(true);
  });
  it("filters and counts facets", async () => {
    const r = await listCirculars({ district: ["dis_khulna"], sector: ["government"] });
    expect(r.ok && r.data.items.map((i) => i.slug)).toEqual(["dc-khulna-office-assistant-2026"]);
    const f = await getFacets({ sector: ["private"] });
    expect(f.ok && f.data.sector.find((s) => s.value === "government")!.count).toBeGreaterThan(0);
  });
  it("suggests which filter to drop on zero results", async () => {
    const filters = { district: ["dis_sylhet"], sector: ["government" as const] };
    const r = await getZeroResultSuggestions(filters);
    expect(r.ok && r.data.length).toBeGreaterThan(0);
  });
  it("returns NOT_FOUND for unknown slugs", async () => {
    const r = await getCircular("nope");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NOT_FOUND");
  });
  it("parses an AI query into chips", async () => {
    const r = await parseSearchQuery("খুলনায় অফিস সহকারীর সরকারি চাকরি");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.filters.district).toEqual(["dis_khulna"]);
    expect(r.data.filters.sector).toEqual(["government"]);
    expect(r.data.filters.q).toContain("সহকারী");
  });
});

describe("tracker", () => {
  beforeAll(() => setRole("seeker"));

  it("rejects illegal moves with a Bangla reason", async () => {
    const list = await listApplications();
    if (!list.ok) throw new Error("list failed");
    const interested = list.data.find((a) => a.status === "interested")!;
    const r = await updateApplicationStatus(interested.id, "viva", interested.version, crypto.randomUUID());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("ILLEGAL_TRANSITION");
      expect(r.error.message_bn).toContain("আবেদন করেছি");
    }
  });
  it("detects edit conflicts by version", async () => {
    const list = await listApplications();
    if (!list.ok) throw new Error("list failed");
    const a = list.data.find((x) => x.status === "interested")!;
    const r = await updateApplicationStatus(a.id, "applied", a.version - 1, crypto.randomUUID());
    expect(!r.ok && r.error.code).toBe("CONFLICT");
  });
  it("is idempotent for the same key", async () => {
    const post = getDb().circulars.find((c) => c.slug === "pathshala-content-intern")!.posts[0].id;
    const key = crypto.randomUUID();
    const [a, b] = await Promise.all([createApplication(post, key), createApplication(post, key)]);
    expect(a.ok && b.ok && a.data.id === b.data.id).toBe(true);
    const all = await listApplications();
    expect(all.ok && all.data.filter((x) => x.postId === post).length).toBe(1);
  });
});

describe("admin fixtures", () => {
  beforeAll(() => setRole("admin"));
  it("has runs that succeeded, failed mid-way and wait for review", async () => {
    const r = await listWorkflowRuns();
    if (!r.ok) throw new Error("runs failed");
    const statuses = r.data.map((x) => x.status);
    expect(statuses).toEqual(expect.arrayContaining(["succeeded", "failed", "waiting_review"]));
    const failed = r.data.find((x) => x.status === "failed")!;
    const idx = failed.steps.findIndex((s) => s.status === "failed");
    expect(idx).toBeGreaterThan(0);
    expect(idx).toBeLessThan(failed.steps.length - 1);
  });
  it("has an open circuit breaker", async () => {
    const r = await getAiHealth("24h");
    expect(r.ok && r.data.features.some((f) => f.breaker.state === "open")).toBe(true);
  });
  it("lists resumes for seekers only", async () => {
    setRole("guest");
    const r = await listResumes();
    expect(!r.ok && r.error.code).toBe("UNAUTHENTICATED");
  });
});
