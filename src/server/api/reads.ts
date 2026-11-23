import "server-only";
import { z } from "zod";
import { auditFilterSchema, cursorSchema, jobFiltersSchema, searchTextSchema } from "@/schemas/api";
import { APPLICATION_STATUSES } from "@/types";
import type { Ctx } from "@/server/context";
import type { Db } from "@/server/db/client";
import * as account from "@/server/services/account";
import * as admin from "@/server/services/admin";
import * as aiHealth from "@/server/services/ai-health";
import * as workflows from "@/server/services/workflows";
import * as applications from "@/server/services/applications";
import * as billing from "@/server/services/billing";
import * as circularsSvc from "@/server/services/circulars";
import * as dashboards from "@/server/services/dashboards";
import * as discovery from "@/server/services/discovery";
import * as notificationsSvc from "@/server/services/notifications";
import * as profile from "@/server/services/profile";
import * as resumes from "@/server/services/resumes";
import { parse } from "./validate";

type Handler = { args: z.ZodType<unknown[]>; run: (ctx: Ctx, db: Db, args: never[]) => Promise<unknown> };

const none = z.tuple([]);
const oneId = z.tuple([z.string().min(1).max(100)]);
const slug = z.tuple([z.string().min(1).max(160)]);

function h<A extends z.ZodType<unknown[]>>(args: A, run: (ctx: Ctx, db: Db, args: z.output<A>) => Promise<unknown>): Handler {
  return { args, run: run as Handler["run"] };
}

/**
 * Every read the UI can make, by name. Arguments are validated here; each service then
 * authorizes the actor itself.
 */
export const READS: Record<string, Handler> = {
  // discovery (public)
  getTaxonomy: h(none, (ctx, db) => discovery.getTaxonomy(ctx, db)),
  listCirculars: h(z.tuple([jobFiltersSchema, cursorSchema.optional()]), async (ctx, db, [filters, cursor]) => {
    const page = await discovery.listCirculars(ctx, db, filters, cursor ?? null);
    // Every search writes a search_logs row (first page only, so paging doesn't double count).
    if (filters.q?.trim() && !cursor) await discovery.logSearch(ctx, db, filters.q, filters, "normal", page.total);
    return page;
  }),
  getFacets: h(z.tuple([jobFiltersSchema]), (ctx, db, [f]) => discovery.getFacets(ctx, db, f)),
  getZeroResultSuggestions: h(z.tuple([jobFiltersSchema]), (ctx, db, [f]) => discovery.getZeroResultSuggestions(ctx, db, f)),
  parseSearchQuery: h(z.tuple([searchTextSchema]), (ctx, db, [text]) => discovery.parseSearchQuery(ctx, db, text)),
  getCircular: h(slug, (ctx, db, [s]) => discovery.getCircular(ctx, db, s)),
  getOrganization: h(slug, (ctx, db, [s]) => discovery.getOrganization(ctx, db, s)),
  listOrganizations: h(none, (ctx, db) => discovery.listOrganizations(ctx, db)),
  getLandingStats: h(none, (ctx, db) => discovery.getLandingStats(ctx, db)),
  getPlans: h(none, (ctx, db) => billing.getPlans(ctx, db)),

  // session & seeker (own data only)
  getMe: h(none, (ctx, db) => account.getMe(ctx, db)),
  getProfile: h(none, (ctx, db) => profile.getProfile(ctx, db)),
  checkEligibility: h(oneId, (ctx, db, [postId]) => discovery.checkEligibility(ctx, db, postId)),
  listBookmarks: h(none, (ctx, db) => discovery.listBookmarks(ctx, db)),
  listSavedSearches: h(none, (ctx, db) => discovery.listSavedSearches(ctx, db)),
  listApplications: h(z.tuple([z.object({ status: z.enum([...APPLICATION_STATUSES, "all"]).optional() }).optional()]), (ctx, db, [f]) =>
    applications.listApplications(ctx, db, f ?? {}),
  ),
  listNotifications: h(none, (ctx, db) => notificationsSvc.listNotifications(ctx, db)),
  getSeekerDashboard: h(none, (ctx, db) => dashboards.getSeekerDashboard(ctx, db)),
  getBilling: h(none, (ctx, db) => billing.getBilling(ctx, db)),
  getSettings: h(none, (ctx, db) => profile.getSettings(ctx, db)),
  exportMyData: h(none, (ctx, db) => account.exportMyData(ctx, db)),
  listResumes: h(none, (ctx, db) => resumes.listResumes(ctx, db)),
  getResume: h(oneId, (ctx, db, [id]) => resumes.getResume(ctx, db, id)),

  // staff
  getAdminDashboard: h(none, (ctx, db) => dashboards.getAdminDashboard(ctx, db)),
  listAdminCirculars: h(
    z.tuple([z.object({ q: z.string().max(200).optional(), status: z.string().max(30).optional() })]),
    (ctx, db, [f]) => circularsSvc.listAdminCirculars(ctx, db, f as { q?: string; status?: "all" }),
  ),
  getAdminCircular: h(oneId, (ctx, db, [id]) => circularsSvc.getAdminCircular(ctx, db, id)),
  getCircularRevisions: h(oneId, (ctx, db, [id]) => circularsSvc.getCircularRevisions(ctx, db, id)),
  listReviewQueue: h(none, (ctx, db) => circularsSvc.listReviewQueue(ctx, db)),
  getReviewItem: h(oneId, (ctx, db, [id]) => circularsSvc.getReviewItem(ctx, db, id)),
  getFeatureFlags: h(none, (ctx, db) => admin.getFeatureFlags(ctx, db)),
  listWorkflowRuns: h(z.tuple([z.object({ status: z.string().max(30).optional() }).optional()]), (ctx, db, [f]) => workflows.listWorkflowRuns(ctx, db, f ?? {})),
  getWorkflowRun: h(oneId, (ctx, db, [id]) => workflows.getWorkflowRun(ctx, db, id)),
  getAiHealth: h(z.tuple([z.enum(["24h", "7d"])]), (ctx, db, [period]) => aiHealth.getAiHealth(ctx, db, period)),
  getFaultInjection: h(none, (ctx, db) => aiHealth.getFaultInjection(ctx, db)),

  // admin only
  listUsers: h(z.tuple([z.object({ q: z.string().max(100).optional(), role: z.string().max(20).optional() }).optional()]), (ctx, db, [f]) =>
    admin.listUsers(ctx, db, f ?? {}),
  ),
  listAuditLogs: h(z.tuple([auditFilterSchema.optional()]), (ctx, db, [f]) => admin.listAuditLogs(ctx, db, f ?? {})),
};

/** Validate the argument list for a read (throws VALIDATION). */
export function parseReadArgs(name: string, args: unknown): unknown[] {
  const handler = READS[name];
  return parse(handler.args, Array.isArray(args) ? args : []) as unknown[];
}
