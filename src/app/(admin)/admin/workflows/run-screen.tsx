"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Ban, FastForward, RotateCw, SkipForward, Wrench } from "lucide-react";
import { toast } from "sonner";
import { RunStatusBadge, STEP_ICON } from "@/components/admin/status-badges";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { DetailSkeleton } from "@/components/feedback/skeletons";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Timeline } from "@/components/ui/stepper";
import { getWorkflowRun, workflowAction } from "@/data";
import { formatDateTimeBn, toBnDigits } from "@/domain/bn";
import { useData } from "@/hooks/use-data";
import { newIdempotencyKey } from "@/hooks/use-mutation";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { WorkflowAction, WorkflowStep } from "@/types";
import { durationBn } from "../ingest/ingest-screen";

function Json({ label, value }: { label: string; value: unknown }) {
  if (value == null) return null;
  return (
    <details className="rounded-lg border bg-muted/40">
      <summary className="min-h-9 cursor-pointer px-3 py-1.5 text-sm font-medium">{label}</summary>
      <pre className="max-h-64 overflow-auto px-3 pb-3 font-mono text-xs" lang="en">{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

export function RunScreen({ runId }: { runId: string }) {
  const q = useData(() => getWorkflowRun(runId), [runId]);
  const [dialog, setDialog] = useState<null | { kind: "skip" | "fix"; step: WorkflowStep } | { kind: "cancel" }>(null);
  const [text, setText] = useState("");
  const [fieldErr, setFieldErr] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const running = q.status === "success" && q.data.status === "running";
  const { refresh } = q;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => refresh(), 2000);
    return () => clearInterval(id);
  }, [running, refresh]);

  if (q.status === "loading") return <DetailSkeleton />;
  if (q.status === "error") return q.error.code === "NOT_FOUND" ? <EmptyState title={t("states.notFoundTitle")} action={<Button asChild><Link href="/admin/ingest">{t("admin.ingest.title")}</Link></Button>} /> : <ErrorState error={q.error} onRetry={q.reload} />;
  const run = q.data;

  const act = async (action: WorkflowAction, payload: { step?: WorkflowStep["code"]; reason?: string; json?: string } = {}) => {
    setPending(`${action}:${payload.step ?? ""}`);
    const r = await workflowAction(run.id, action, payload, newIdempotencyKey());
    setPending(null);
    if (r.ok) {
      q.setData(r.data);
      setDialog(null);
      setText("");
      toast.success(t("admin.workflow.actionDone"));
    } else if (r.error.fields) setFieldErr(Object.values(r.error.fields)[0]);
    else toast.error(r.error.message_bn, { description: r.error.requestId });
  };

  const current = run.steps.find((s) => s.code === run.currentStep);
  const busy = (k: string) => pending === k;

  return (
    <div>
      <PageHeader
        title={t("admin.workflow.title", { id: run.id })}
        back={{ href: "/admin/ingest", label: t("admin.ingest.title") }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <RunStatusBadge status={run.status} />
            <span>{t(`enums.ingestSource.${run.source.kind}`)} · <span lang="en">{run.source.label}</span></span>
            {run.circularSlug && <Link href={`/jobs/${run.circularSlug}`} className="font-medium text-primary hover:underline">{t("admin.workflow.viewCircular")}</Link>}
          </span>
        }
        actions={["running", "waiting_review", "queued"].includes(run.status) && (
          <Button variant="destructive-soft" onClick={() => setDialog({ kind: "cancel" })}><Ban aria-hidden />{t("admin.workflow.cancelRun")}</Button>
        )}
      />
      <p role="status" aria-live="polite" className="mb-4 text-sm text-muted-foreground">
        {t("admin.workflow.live", { status: t(`enums.workflowRunStatus.${run.status}`), step: current ? current.labelBn : "—" })}
        {running && ` · ${t("admin.workflow.autoRefresh")}`}
      </p>
      <section className="rounded-xl border bg-surface p-4 md:p-6">
        <Timeline
          items={run.steps.map((s) => {
            const { Icon, tone } = STEP_ICON[s.status];
            return {
              id: s.id,
              tone,
              icon: <Icon className={cn("size-4", s.status === "running" && "animate-spin")} aria-hidden />,
              title: (
                <span className="flex flex-wrap items-center gap-2">
                  {s.labelBn}
                  <code className="rounded bg-muted px-1.5 text-xs text-muted-foreground" lang="en">{s.code}</code>
                  <Badge size="sm" variant={tone === "success" ? "success" : tone === "danger" ? "danger" : tone === "warning" ? "warning" : tone === "info" ? "info" : "neutral"}>{t(`enums.workflowStepStatus.${s.status}`)}</Badge>
                </span>
              ),
              meta: (
                <span className="tabular-nums">
                  {t("admin.workflow.attempts", { n: s.attempts, max: s.maxAttempts })}
                  {s.durationMs != null && ` · ${durationBn(s.durationMs)}`}
                  {s.startedAt && ` · ${formatDateTimeBn(s.startedAt)}`}
                </span>
              ),
              body: (
                <div className="space-y-2">
                  {s.error && (
                    <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm">
                      <p className="font-mono text-xs text-danger" lang="en">{s.error.code}</p>
                      <p className="text-ink">{s.error.messageBn}</p>
                    </div>
                  )}
                  <Json label={t("admin.workflow.input")} value={s.input} />
                  <Json label={t("admin.workflow.output")} value={s.output} />
                  <div className="flex flex-wrap gap-2">
                    {s.status === "failed" && (
                      <>
                        <Button size="sm" loading={busy("retry_step:")} onClick={() => void act("retry_step")}><RotateCw aria-hidden />{t("admin.workflow.retry")}</Button>
                        <Button size="sm" variant="secondary" onClick={() => { setText(JSON.stringify(s.output ?? { titleBn: "", posts: [] }, null, 2)); setFieldErr(null); setDialog({ kind: "fix", step: s }); }}><Wrench aria-hidden />{t("admin.workflow.fixAndRun")}</Button>
                      </>
                    )}
                    {["succeeded", "failed", "skipped"].includes(s.status) && run.status !== "running" && (
                      <Button size="sm" variant="ghost" loading={busy(`run_from_step:${s.code}`)} onClick={() => void act("run_from_step", { step: s.code })}><FastForward aria-hidden />{t("admin.workflow.runFrom")}</Button>
                    )}
                    {s.skippable && ["pending", "failed"].includes(s.status) && (
                      <Button size="sm" variant="ghost" onClick={() => { setText(""); setFieldErr(null); setDialog({ kind: "skip", step: s }); }}><SkipForward aria-hidden />{t("admin.workflow.skip")}</Button>
                    )}
                  </div>
                </div>
              ),
            };
          })}
        />
      </section>

      <Dialog open={dialog != null && dialog.kind !== "cancel"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          {dialog && dialog.kind !== "cancel" && (
            <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (dialog.kind === "skip") { if (text.trim().length < 5) return setFieldErr(t("validation.reasonRequired")); void act("skip_step", { step: dialog.step.code, reason: text.trim() }); } else void act("fix_and_run", { step: dialog.step.code, json: text }); }}>
              <DialogHeader>
                <DialogTitle>{dialog.kind === "skip" ? t("admin.workflow.skipTitle") : t("admin.workflow.fixTitle")}</DialogTitle>
                <DialogDescription>{dialog.step.labelBn} · {toBnDigits(dialog.step.attempts)}/{toBnDigits(dialog.step.maxAttempts)}</DialogDescription>
              </DialogHeader>
              <Field id="wf-text" label={dialog.kind === "skip" ? t("admin.circulars.reason") : "JSON"} required error={fieldErr ?? undefined}>
                <Textarea rows={dialog.kind === "fix" ? 10 : 3} className={dialog.kind === "fix" ? "font-mono text-sm" : undefined} lang={dialog.kind === "fix" ? "en" : undefined} value={text} onChange={(e) => { setText(e.target.value); setFieldErr(null); }} />
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialog(null)}>{t("common.cancel")}</Button>
                <Button type="submit" loading={pending != null}>{dialog.kind === "skip" ? t("admin.workflow.skip") : t("admin.workflow.fixAndRun")}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={dialog?.kind === "cancel"} onOpenChange={(o) => !o && setDialog(null)} destructive title={t("admin.workflow.cancelRun")} description={`${run.id} — ${t("admin.workflow.cancelConfirm")}`} pending={pending != null} onConfirm={() => void act("cancel_run")} />
    </div>
  );
}
