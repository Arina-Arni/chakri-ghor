// TEMP — replaced by the real implementation in Part 2
import type {
  AdminSettings,
  AdminUser,
  Application,
  AuditLogEntry,
  Billing,
  Bookmark,
  Circular,
  FaultInjection,
  Notification,
  Organization,
  Profile,
  Resume,
  ReviewQueueItem,
  SavedSearch,
  Settings,
  WorkflowRun,
} from "@/types";
import { buildAdminSettings, buildAudit, buildReviewQueue, buildRuns, buildUsers } from "./admin";
import { buildCirculars } from "./circulars";
import { organizationSeeds } from "./organizations";
import {
  buildApplications,
  buildBilling,
  buildNotifications,
  buildProfile,
  buildResumes,
  buildSavedSearches,
  buildSettings,
} from "./seeker";

export type Db = {
  createdAt: number;
  organizations: Organization[];
  circulars: Circular[];
  profile: Profile;
  bookmarks: Bookmark[];
  applications: Application[];
  resumes: Resume[];
  notifications: Notification[];
  savedSearches: SavedSearch[];
  billing: Billing;
  settings: Settings;
  runs: WorkflowRun[];
  reviewQueue: ReviewQueueItem[];
  users: AdminUser[];
  audit: AuditLogEntry[];
  adminSettings: AdminSettings;
  faultInjection: FaultInjection | null;
  aiSearchUsedGuest: number;
  reports: { circularId: string; message: string }[];
};

let db: Db | null = null;

/** In-memory store, created on first use so module import never reads the clock. */
export function getDb(): Db {
  if (db) return db;
  const now = Date.now();
  const organizations = organizationSeeds.map((o) => ({ ...o }));
  const circulars = buildCirculars(now, organizations);
  for (const o of organizations) {
    const mine = circulars.filter((c) => c.organization.id === o.id && c.status === "published");
    o.totalCircularCount = mine.length;
    o.openCircularCount = mine.filter((c) => new Date(c.endAt).getTime() > now).length;
  }
  const bookmarkSlugs = [
    "dc-khulna-office-assistant-2026",
    "railway-khalashi-2026",
    "bsc-senior-officer-2026",
    "meghna-cash-officer",
    "dc-rajshahi-office-sohayok-2026",
  ];
  db = {
    createdAt: now,
    organizations,
    circulars,
    profile: buildProfile(now),
    bookmarks: circulars
      .filter((c) => bookmarkSlugs.includes(c.slug))
      .map((c, i) => ({ id: `bm_${i + 1}`, postId: c.posts[0].id, circularId: c.id, createdAt: new Date(now - i * 3_600_000).toISOString() })),
    applications: buildApplications(now, circulars),
    resumes: buildResumes(now, circulars),
    notifications: buildNotifications(now),
    savedSearches: buildSavedSearches(now),
    billing: buildBilling(now),
    settings: buildSettings(now),
    runs: buildRuns(now),
    reviewQueue: buildReviewQueue(now),
    users: buildUsers(now),
    audit: buildAudit(now),
    adminSettings: buildAdminSettings(),
    faultInjection: null,
    aiSearchUsedGuest: 0,
    reports: [],
  };
  return db;
}
