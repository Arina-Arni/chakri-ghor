import { t } from "@/i18n";
import type { ApplicationStatus } from "@/types";
import { allow, deny, type TransitionCheck } from "./types";

/** The forward pipeline (spec §4.2). */
export const PIPELINE: ApplicationStatus[] = [
  "saved",
  "preparing",
  "applied",
  "admit_card",
  "exam_scheduled",
  "written_passed",
  "viva",
  "selected",
];

export const TERMINAL: ApplicationStatus[] = ["selected", "rejected", "withdrawn"];

export const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Forward edges. Each status moves one step on; `preparing` is optional, so `saved → applied`
 * is also allowed. Any non-terminal status can end in `rejected` or `withdrawn`.
 */
export const APPLICATION_EDGES: Record<ApplicationStatus, ApplicationStatus[]> = {
  saved: ["preparing", "applied", "rejected", "withdrawn"],
  preparing: ["applied", "rejected", "withdrawn"],
  applied: ["admit_card", "rejected", "withdrawn"],
  admit_card: ["exam_scheduled", "rejected", "withdrawn"],
  exam_scheduled: ["written_passed", "rejected", "withdrawn"],
  written_passed: ["viva", "rejected", "withdrawn"],
  viva: ["selected", "rejected", "withdrawn"],
  selected: [],
  rejected: [],
  withdrawn: [],
};

export type ApplicationTransitionCtx = {
  now: number;
  /** Application window of the circular. */
  startAt: string;
  endAt: string;
  /** When the user says they applied (moving to `applied`). Defaults to `now`. */
  appliedAt?: string | null;
  /** Required for `exam_scheduled`. */
  examAt?: string | null;
  /** Previous status and when the last move happened — used for one-step undo. */
  previousStatus?: ApplicationStatus | null;
  lastTransitionAt?: string | null;
};

const label = (s: ApplicationStatus) => `‘${t(`enums.applicationStatus.${s}`)}’`;

/** Whether one step back (undo) from `from` to `to` is allowed right now. */
function isUndo(from: ApplicationStatus, to: ApplicationStatus, ctx: ApplicationTransitionCtx): boolean {
  if (ctx.previousStatus !== to || !ctx.lastTransitionAt) return false;
  if (ctx.now - new Date(ctx.lastTransitionAt).getTime() > UNDO_WINDOW_MS) return false;
  return APPLICATION_EDGES[to].includes(from);
}

export function canTransitionApplication(
  from: ApplicationStatus,
  to: ApplicationStatus,
  ctx: ApplicationTransitionCtx,
): TransitionCheck {
  if (from === to) return deny("SAME_STATUS", "অবস্থা আগের মতোই আছে।");

  if (!APPLICATION_EDGES[from].includes(to)) {
    if (isUndo(from, to, ctx)) return allow();
    if (TERMINAL.includes(from)) {
      return deny("TERMINAL", `${label(from)} চূড়ান্ত অবস্থা — আর বদলানো যায় না।`);
    }
    const back = PIPELINE.indexOf(to) >= 0 && PIPELINE.indexOf(to) < PIPELINE.indexOf(from);
    if (back) {
      return deny(
        "UNDO_EXPIRED",
        "শুধু শেষ ধাপটি ২৪ ঘণ্টার মধ্যে ফেরানো যায়।",
      );
    }
    const next = APPLICATION_EDGES[from].map(label).join(", ");
    return deny("ILLEGAL_JUMP", `${label(from)} থেকে সরাসরি ${label(to)}-তে যাওয়া যায় না। পরের ধাপ: ${next}`);
  }

  if (to === "applied") {
    const start = new Date(ctx.startAt).getTime();
    const end = new Date(ctx.endAt).getTime();
    const appliedAt = ctx.appliedAt ? new Date(ctx.appliedAt).getTime() : ctx.now;
    if (ctx.now < start || appliedAt < start) {
      return deny("NOT_STARTED", "আবেদন এখনো শুরু হয়নি — শুরুর আগে ‘আবেদন করেছি’ করা যায় না।");
    }
    if (appliedAt > end) {
      return deny("AFTER_DEADLINE", "আবেদনের শেষ সময়ের পরে আবেদন করা যায় না। কবে আবেদন করেছিলেন তা ঠিক করে দিন।");
    }
  }

  if (to === "exam_scheduled" && !ctx.examAt) {
    return deny("EXAM_AT_REQUIRED", "পরীক্ষার তারিখ ও সময় দিন।");
  }

  return allow();
}

/** Short next-step hint shown on tracker cards. */
export const NEXT_ACTION_BN: Partial<Record<ApplicationStatus, string>> = {
  saved: "শেষ সময়ের আগে আবেদন করুন",
  preparing: "কাগজপত্র গুছিয়ে আবেদন জমা দিন",
  applied: "ফি জমা ও প্রবেশপত্রের খোঁজ রাখুন",
  admit_card: "প্রবেশপত্র ডাউনলোড করুন",
  exam_scheduled: "পরীক্ষার কেন্দ্র দেখে নিন",
  written_passed: "ভাইভার প্রস্তুতি নিন",
  viva: "মূল সনদপত্র সঙ্গে নিন",
};
