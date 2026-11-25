"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ExternalLink, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { type Column, DataTable } from "@/components/admin/data-table";
import { RunStatusBadge } from "@/components/admin/status-badges";
import { EmptyState } from "@/components/feedback/empty-state";
import { Notice } from "@/components/feedback/notice";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { FileDropzone, type DropzoneState } from "@/components/ui/file-dropzone";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getAiHealth, ingest, listTeletalkPrivateJobs, listWorkflowRuns } from "@/data";
import { formatRelativeBn, toBnDigits } from "@/domain/bn";
import { TELETALK_PRIVATE_PAGE } from "@/domain/teletalk-private";
import { useData } from "@/hooks/use-data";
import { newIdempotencyKey } from "@/hooks/use-mutation";
import { t } from "@/i18n";
import { CIRCULAR_FILE } from "@/schemas/common";
import { WORKFLOW_STEPS, type IngestInput, type WorkflowRun, type WorkflowStepCode } from "@/types";

const STEPS: WorkflowStepCode[] = WORKFLOW_STEPS.filter((s) => s !== "apply_update" && s !== "review_gate");

export const durationBn = (ms: number | null) => (ms == null ? "—" : ms < 60_000 ? `${toBnDigits(Math.round(ms / 1000))} সে.` : `${toBnDigits(Math.round(ms / 60_000))} মি.`);

/**
 * Teletalk's private-jobs list, checked live. Nothing is imported automatically: "ইনজেস্ট করুন" puts
 * the job's PDF link into the form above, so it goes through extraction, review and publishing.
 */
function TeletalkPrivateCard({ onUse }: { onUse: (pdfUrl: string) => void }) {
  const q = useData(() => listTeletalkPrivateJobs(), []);
  return (
    <Card>
      <section aria-labelledby="tt-private-h" className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="tt-private-h" className="text-lg font-semibold">{t("admin.ingest.ttTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("admin.ingest.ttBody")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" loading={q.refreshing} onClick={() => void q.refresh()}>
              <RefreshCw aria-hidden />
              {t("admin.ingest.ttRecheck")}
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href={TELETALK_PRIVATE_PAGE} target="_blank" rel="noopener noreferrer">
                {t("admin.ingest.ttOpen")}
                <ExternalLink aria-hidden />
              </a>
            </Button>
          </div>
        </div>
        <div aria-live="polite">
          {q.status === "loading" ? (
            <p className="text-muted-foreground">{t("common.loading")}</p>
          ) : q.status === "error" ? (
            <Notice tone="danger">{q.error.message_bn}</Notice>
          ) : !q.data.available ? (
            <Notice tone="warning">{t("admin.ingest.ttUnavailable")}</Notice>
          ) : q.data.jobs.length === 0 ? (
            <p className="text-muted-foreground">{t("admin.ingest.ttEmpty")}</p>
          ) : (
            <>
              <p className="font-medium">{t("admin.ingest.ttCount", { n: toBnDigits(q.data.count) })}</p>
              <ul className="divide-y">
                {q.data.jobs.map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="font-medium">{j.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {[j.organization, j.deadline && t("admin.ingest.ttDeadline", { date: j.deadline })].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {j.pdfUrl ? (
                      <Button type="button" size="sm" onClick={() => onUse(j.pdfUrl!)}>
                        {t("admin.ingest.ttUse")}
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">{t("admin.ingest.ttNoPdf")}</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        {q.status === "success" && <p className="text-xs text-muted-foreground">{t("admin.ingest.ttChecked", { when: formatRelativeBn(q.data.checkedAt) })}</p>}
      </section>
    </Card>
  );
}

export function IngestScreen() {
  const router = useRouter();
  const runs = useData(() => listWorkflowRuns(), []);
  const health = useData(() => getAiHealth("24h"), []);
  const [tab, setTab] = useState<"pdf_upload" | "text" | "pdf_url">("pdf_upload");
  const [file, setFile] = useState<File | null>(null);
  const [drop, setDrop] = useState<DropzoneState>({ status: "idle" });
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [failAt, setFailAt] = useState<WorkflowStepCode | "none">("none");
  const [error, setError] = useState<string | null>(null);
  const [dup, setDup] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const allowed = health.status === "success" && health.data.faultInjectionAllowed;

  const submit = async () => {
    setError(null);
    setDup(null);
    const fail = failAt === "none" ? undefined : failAt;
    let input: IngestInput;
    if (tab === "pdf_upload") {
      if (!file) return setError(t("validation.required"));
      input = { kind: "pdf_upload", file, failAtStep: fail };
    } else if (tab === "text") {
      if (text.trim().length < 50) return setError(t("validation.tooShort", { n: 50 }));
      input = { kind: "text", text, failAtStep: fail };
    } else {
      try {
        new URL(url);
      } catch {
        return setError(t("validation.url"));
      }
      input = { kind: "pdf_url", url, failAtStep: fail };
    }
    setPending(true);
    const r = await ingest(input, newIdempotencyKey());
    setPending(false);
    if (r.ok) {
      toast.success(t("admin.ingest.started"));
      router.push(`/admin/workflows/${r.data.runId}`);
    } else if (r.error.code === "DUPLICATE") setDup(r.error.fields?.runId ?? null);
    else if (r.error.fields) setError(Object.values(r.error.fields)[0]);
    else toast.error(r.error.message_bn);
  };

  const columns: Column<WorkflowRun>[] = [
    { id: "id", header: t("admin.ingest.colId"), primary: true, hideable: false, sortValue: (r) => r.id, cell: (r) => <Link href={`/admin/workflows/${r.id}`} className="font-mono font-medium text-primary hover:underline" lang="en">{r.id}</Link> },
    { id: "source", header: t("admin.ingest.colSource"), cell: (r) => <span className="block max-w-64 truncate" title={r.source.label}>{t(`enums.ingestSource.${r.source.kind}`)} · {r.source.label}</span> },
    { id: "status", header: t("admin.ingest.colStatus"), sortValue: (r) => r.status, cell: (r) => <RunStatusBadge status={r.status} /> },
    { id: "step", header: t("admin.ingest.colStep"), cell: (r) => (r.currentStep ? t(`enums.workflowStep.${r.currentStep}`) : "—") },
    { id: "started", header: t("admin.ingest.colStarted"), sortValue: (r) => r.startedAt, cell: (r) => formatRelativeBn(r.startedAt) },
    { id: "duration", header: t("admin.ingest.colDuration"), sortValue: (r) => r.durationMs ?? 0, cell: (r) => durationBn(r.durationMs) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("admin.ingest.title")} />
      <Card>
        <form noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
          <Tabs value={tab} onValueChange={(v) => { setTab(v as typeof tab); setError(null); }}>
            <TabsList className="max-w-md">
              <TabsTrigger value="pdf_upload">{t("admin.ingest.tabPdf")}</TabsTrigger>
              <TabsTrigger value="text">{t("admin.ingest.tabText")}</TabsTrigger>
              <TabsTrigger value="pdf_url">{t("admin.ingest.tabUrl")}</TabsTrigger>
            </TabsList>
            <TabsContent value="pdf_upload">
              <FileDropzone rule={CIRCULAR_FILE} state={drop} title={t("admin.ingest.tabPdf")} typesLabel={t("admin.form.pdfTypes")} onFile={(f) => { setFile(f); setDrop({ status: "success", fileName: f.name }); }} onInvalid={(m) => setDrop({ status: "error", message: m })} />
              {error && <p className="mt-2 text-sm font-medium text-danger" role="alert">⚠ {error}</p>}
            </TabsContent>
            <TabsContent value="text">
              <Field id="ing-text" label={t("admin.ingest.text")} required error={error ?? undefined}><Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} /></Field>
            </TabsContent>
            <TabsContent value="pdf_url">
              <Field id="ing-url" label={t("admin.ingest.url")} required hint={t("admin.ingest.urlHint")} error={error ?? undefined}><Input type="url" lang="en" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.gov.bd/notice.pdf" /></Field>
            </TabsContent>
          </Tabs>
          {dup && (
            <Notice tone="info" live title={t("admin.ingest.duplicate")} action={<Link href={`/admin/workflows/${dup}`} className="font-semibold text-primary underline">{t("admin.ingest.viewRun")}</Link>} />
          )}
          {allowed && (
            <details className="rounded-lg border bg-muted/40 p-3">
              <summary className="min-h-8 cursor-pointer font-medium">{t("admin.ingest.advanced")}</summary>
              <div className="mt-3 max-w-sm space-y-1">
                <label htmlFor="fail-at" className="font-medium">{t("admin.ingest.failAt")}</label>
                <Select value={failAt} onValueChange={(v) => setFailAt(v as WorkflowStepCode | "none")}>
                  <SelectTrigger id="fail-at" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("admin.ingest.failAtNone")}</SelectItem>
                    {STEPS.map((s) => <SelectItem key={s} value={s}>{t(`enums.workflowStep.${s}`)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">{t("admin.ingest.failAtHint")}</p>
              </div>
            </details>
          )}
          <Button type="submit" loading={pending}><Play aria-hidden />{t("admin.ingest.submit")}</Button>
        </form>
      </Card>
      <TeletalkPrivateCard
        onUse={(pdfUrl) => {
          setTab("pdf_url");
          setUrl(pdfUrl);
          setError(null);
          window.scrollTo({ top: 0, behavior: "smooth" });
          toast.info(t("admin.ingest.ttFilled"));
        }}
      />
      <section aria-labelledby="runs-h">
        <h2 id="runs-h" className="mb-3 text-xl font-semibold">{t("admin.ingest.runs")}</h2>
        <DataTable caption={t("admin.ingest.runs")} columns={columns} rows={runs.data} rowKey={(r) => r.id} status={runs.status} error={runs.error} onRetry={runs.reload} empty={<EmptyState title={t("admin.ingest.noRuns")} />} />
      </section>
    </div>
  );
}
