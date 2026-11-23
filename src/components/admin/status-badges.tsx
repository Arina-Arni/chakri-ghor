import { Ban, CheckCircle2, CircleDashed, Loader2, PauseCircle, Redo2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { t } from "@/i18n";
import type { CircularStatus, WorkflowRunStatus, WorkflowStepStatus } from "@/types";

const CIRC = {
  draft: "neutral",
  pending_review: "warning",
  published: "success",
  closed: "outline",
  rejected: "danger",
  cancelled: "neutral",
  archived: "outline",
} as const;

export function CircularStatusBadge({ status }: { status: CircularStatus }) {
  return <Badge size="sm" variant={CIRC[status]}>{t(`enums.circularStatus.${status}`)}</Badge>;
}

const RUN = {
  queued: ["neutral", CircleDashed],
  running: ["info", Loader2],
  succeeded: ["success", CheckCircle2],
  failed: ["danger", XCircle],
  waiting_review: ["warning", PauseCircle],
  cancelled: ["neutral", Ban],
} as const;

export function RunStatusBadge({ status }: { status: WorkflowRunStatus }) {
  const [variant, Icon] = RUN[status];
  return (
    <Badge size="sm" variant={variant}>
      <Icon className={status === "running" ? "animate-spin" : undefined} aria-hidden />
      {t(`enums.workflowRunStatus.${status}`)}
    </Badge>
  );
}

/** ○ pending, spinner running, ✓ succeeded, ✗ failed, ⤼ skipped, ⏸ waiting */
export const STEP_ICON: Record<WorkflowStepStatus, { Icon: typeof CheckCircle2; tone: "muted" | "info" | "success" | "danger" | "warning" | "default" }> = {
  pending: { Icon: CircleDashed, tone: "muted" },
  running: { Icon: Loader2, tone: "info" },
  succeeded: { Icon: CheckCircle2, tone: "success" },
  failed: { Icon: XCircle, tone: "danger" },
  skipped: { Icon: Redo2, tone: "muted" },
  waiting: { Icon: PauseCircle, tone: "warning" },
};
