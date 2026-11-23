import type { CircularListItem, JobFilters } from "./circular";
import type { Id, IsoDateTime, Versioned } from "./common";
import type { PlanId } from "./profile";

export type Bookmark = { id: Id; postId: Id; circularId: Id; createdAt: IsoDateTime };

export type SavedSearch = {
  id: Id;
  name: string;
  filters: JobFilters;
  alertEnabled: boolean;
  newMatchCount: number;
  createdAt: IsoDateTime;
};

export const APPLICATION_STATUSES = [
  "interested",
  "applied",
  "admit_card",
  "exam",
  "viva",
  "selected",
  "rejected",
  "withdrawn",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type ApplicationEvent = {
  id: Id;
  applicationId: Id;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  note: string | null;
  createdAt: IsoDateTime;
};

export type Application = Versioned & {
  id: Id;
  circularId: Id;
  circularSlug: string;
  postId: Id;
  jobTitleBn: string;
  organizationNameBn: string;
  organizationShortName: string;
  status: ApplicationStatus;
  deadlineAt: IsoDateTime;
  examAt: IsoDateTime | null;
  examVenue: string | null;
  applicantRef: string | null;
  feePaid: boolean;
  notes: string;
  nextActionBn: string | null;
  events: ApplicationEvent[];
  createdAt: IsoDateTime;
};

export type ApplicationPatch = Partial<
  Pick<Application, "applicantRef" | "feePaid" | "examAt" | "examVenue" | "notes">
>;

export type NotificationType = "deadline" | "new_match" | "exam" | "application" | "system";

export type Notification = {
  id: Id;
  type: NotificationType;
  titleBn: string;
  bodyBn: string;
  href: string | null;
  readAt: IsoDateTime | null;
  createdAt: IsoDateTime;
};

export type Plan = {
  id: PlanId;
  nameBn: string;
  /** Price in BDT for one `period`; 0 for free. Configurable by admins. */
  priceBdt: number;
  period: "day" | "month";
  featuresBn: string[];
  quotas: Record<UsageFeature, number>;
};

export type SubscriptionStatus = "none" | "trialing" | "active" | "grace" | "expired";

export type Subscription = {
  planId: PlanId;
  status: SubscriptionStatus;
  trialEndsAt: IsoDateTime | null;
  currentPeriodEnd: IsoDateTime | null;
  cancelAtPeriodEnd: boolean;
  trialUsed: boolean;
};

export type UsageFeature = "ai_search" | "resume_tailor" | "cv_parse";

export type Usage = { feature: UsageFeature; used: number; limit: number; resetsAt: IsoDateTime };

export type Billing = { plans: Plan[]; subscription: Subscription; usage: Usage[] };

export type SeekerDashboard = {
  greetingName: string;
  profileCompleteness: number;
  missingItems: string[];
  stats: { saved: number; applied: number; upcomingExams: number };
  closingThisWeek: CircularListItem[];
  upcomingExams: { applicationId: Id; jobTitleBn: string; examAt: IsoDateTime; venue: string | null }[];
  applicationsByStatus: { status: string; labelBn: string; count: number }[];
  recommended: (CircularListItem & { reasonsBn: string[] })[];
  savedSearches: SavedSearch[];
};

export type Settings = Versioned & {
  notifications: { email: boolean; deadlineReminders: boolean; newMatches: boolean; examReminders: boolean };
};
