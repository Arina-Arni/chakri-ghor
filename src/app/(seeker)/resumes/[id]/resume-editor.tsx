"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CloudOff, Download, History, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AiFallbackNotice, AiProgress, QuotaNotice } from "@/components/feedback/ai-status";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ConflictDialog } from "@/components/feedback/conflict-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Notice } from "@/components/feedback/notice";
import { DetailSkeleton } from "@/components/feedback/skeletons";
import { PageHeader } from "@/components/layout/page-header";
import { DiffList } from "@/components/resume/diff-list";
import { ResumePreview } from "@/components/resume/resume-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ScoreRing } from "@/components/ui/score-ring";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { decideResumeChange, downloadResumePdf, getResume, restoreResumeVersion, saveResume, tailorResume } from "@/data";
import { computeAtsScore } from "@/domain/ats";
import { formatDateTimeBn, formatRelativeBn, toBnDigits } from "@/domain/bn";
import { useData } from "@/hooks/use-data";
import { useIsDesktop } from "@/hooks/use-media-query";
import { newIdempotencyKey } from "@/hooks/use-mutation";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import { t } from "@/i18n";
import type { ApiError, Resume, ResumeContent, ResumeVersion } from "@/types";

type SaveState = "idle" | "saving" | "saved" | "error";

function AtsPanel({ resume, content, onAddKeyword }: { resume: Resume; content: ResumeContent; onAddKeyword: (kw: string) => void }) {
  const ats = useMemo(() => computeAtsScore(content, { required: resume.keywordsRequired, preferred: resume.keywordsPreferred }), [content, resume.keywordsRequired, resume.keywordsPreferred]);
  const rows = [
    [t("resume.breakdownRequired"), ats.breakdown.required, 60],
    [t("resume.breakdownPreferred"), ats.breakdown.preferred, 20],
    [t("resume.breakdownSections"), ats.breakdown.sections, 10],
    [t("resume.breakdownFormat"), ats.breakdown.format, 10],
  ] as const;
  const noKw = resume.keywordsRequired.length + resume.keywordsPreferred.length === 0;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4" aria-live="polite">
        <ScoreRing score={ats.score} />
        <div>
          <p className="text-sm text-muted-foreground">{t("resume.score")}</p>
          <p className="text-sm text-muted-foreground">চমৎকার ≥ ৮৫ · ভালো ৭০–৮৪ · উন্নতি দরকার &lt; ৭০</p>
        </div>
      </div>
      <section aria-labelledby="bd-h">
        <h3 id="bd-h" className="mb-2 font-semibold">{t("resume.breakdown")}</h3>
        <dl className="space-y-2">
          {rows.map(([label, v, max]) => (
            <div key={label}>
              <div className="flex justify-between text-sm"><dt>{label}</dt><dd className="tabular-nums">{toBnDigits(v)}/{toBnDigits(max)}</dd></div>
              <div className="h-2 rounded-full bg-muted" aria-hidden><div className="h-2 rounded-full bg-primary" style={{ width: `${(v / max) * 100}%` }} /></div>
            </div>
          ))}
        </dl>
      </section>
      {noKw ? (
        <Notice tone="info">{t("resume.noKeywords")}</Notice>
      ) : (
        <>
          <section aria-labelledby="m-h">
            <h3 id="m-h" className="mb-2 font-semibold">{t("resume.matchedKeywords")} ({toBnDigits(ats.matched.length)})</h3>
            <ul className="flex flex-wrap gap-2">
              {ats.matched.map((k) => (
                <li key={k}><Badge variant="success"><Check aria-hidden /><span lang="en">{k}</span></Badge></li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="x-h">
            <h3 id="x-h" className="mb-2 font-semibold">{t("resume.missingKeywords")} ({toBnDigits(ats.missing.length)})</h3>
            <ul className="space-y-2">
              {ats.missing.map((k) => (
                <li key={k} className="flex flex-wrap items-center gap-2">
                  <Chip><span lang="en">{k}</span></Chip>
                  <Button size="sm" variant="ghost" onClick={() => onAddKeyword(k)} aria-label={`${t("resume.addIfTrue")}: ${k}`}>
                    {t("resume.addIfTrue")}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

export function ResumeEditor({ id }: { id: string }) {
  const q = useData(() => getResume(id), [id]);
  const isDesktop = useIsDesktop();
  const [content, setContent] = useState<ResumeContent | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [tailorMode, setTailorMode] = useState<"ai" | "fallback" | null>(null);
  const [quota, setQuota] = useState<ApiError | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [restore, setRestore] = useState<ResumeVersion | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const versionRef = useRef(0);

  useEffect(() => {
    if (q.status !== "success") return;
    const timer = setTimeout(() => {
      setResume(q.data);
      setContent(q.data.content);
      versionRef.current = q.data.version;
      setDirty(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [q.status, q.data]);

  useUnsavedGuard(dirty || save === "saving");

  // Autosave 1.2 s after the last edit.
  useEffect(() => {
    if (!dirty || !content) return;
    const timer = setTimeout(async () => {
      setSave("saving");
      const r = await saveResume(id, content, versionRef.current, newIdempotencyKey());
      if (r.ok) {
        versionRef.current = r.data.version;
        setResume(r.data);
        setDirty(false);
        setSave("saved");
      } else if (r.error.code === "CONFLICT") {
        setSave("error");
        setConflict(true);
      } else {
        setSave("error");
        toast.error(r.error.message_bn);
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [content, dirty, id]);

  const update = useCallback((fn: (c: ResumeContent) => ResumeContent) => {
    setContent((c) => (c ? fn(c) : c));
    setDirty(true);
  }, []);

  if (q.status === "loading" || (q.status === "success" && (!content || !resume))) return <DetailSkeleton />;
  if (q.status === "error")
    return q.error.code === "NOT_FOUND" ? (
      <EmptyState title={t("states.notFoundTitle")} action={<Button asChild><Link href="/resumes">{t("resume.listTitle")}</Link></Button>} />
    ) : (
      <ErrorState error={q.error} onRetry={q.reload} />
    );
  if (!content || !resume) return null;

  const applyServer = (r: Resume) => {
    setResume(r);
    setContent(r.content);
    versionRef.current = r.version;
    setDirty(false);
  };

  const runTailor = async () => {
    if (!resume.postId) return;
    setTailoring(true);
    setQuota(null);
    const r = await tailorResume(resume.id, resume.postId, newIdempotencyKey());
    setTailoring(false);
    if (r.ok) {
      applyServer(r.data.resume);
      setTailorMode(r.data.mode);
      toast.success(r.data.mode === "ai" ? t("resume.tailorDone") : t("resume.tailorFallback"));
    } else if (r.error.code === "QUOTA_EXCEEDED") setQuota(r.error);
    else toast.error(r.error.message_bn, { description: r.error.requestId });
  };

  const decide = async (changeId: string, accept: boolean) => {
    setDeciding(`${changeId}:${accept ? 1 : 0}`);
    const r = await decideResumeChange(resume.id, changeId, accept);
    setDeciding(null);
    if (r.ok) applyServer(r.data);
    else toast.error(r.error.message_bn);
  };

  const pending = resume.changes.filter((c) => c.status === "pending").length;
  const saveLabel =
    save === "saving" ? (
      <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />{t("resume.autosaving")}</span>
    ) : save === "error" ? (
      <span className="inline-flex items-center gap-1 text-danger"><CloudOff className="size-4" aria-hidden />{t("resume.unsaved")}</span>
    ) : dirty ? (
      <span className="text-muted-foreground">{t("resume.unsaved")}</span>
    ) : (
      <span className="inline-flex items-center gap-1 text-success"><Check className="size-4" aria-hidden />{t("resume.autosaved")}</span>
    );

  const changesPanel = (
    <div className="space-y-4">
      {resume.aiSummaryBn && <p className="font-medium text-ai">✦ {resume.aiSummaryBn}</p>}
      {resume.postId ? (
        <Button onClick={() => void runTailor()} loading={tailoring} className="w-full bg-ai hover:bg-[#5b21b6]">
          <Sparkles aria-hidden />
          {t("resume.tailor")}
        </Button>
      ) : (
        <Notice tone="info">{t("resume.noKeywords")}</Notice>
      )}
      {tailoring && <AiProgress text={t("resume.tailoring")} />}
      {tailorMode === "fallback" && <AiFallbackNotice text={t("resume.tailorFallback")} />}
      {quota && <QuotaNotice used={Number(quota.fields?.used)} limit={Number(quota.fields?.limit)} resetsAt={quota.fields?.resetsAt} />}
      {resume.changes.length === 0 ? (
        <EmptyState icon={Sparkles} title={t("resume.noChanges")} headingLevel={3} className="py-6" />
      ) : (
        <DiffList changes={[...resume.changes].sort((a, b) => (a.status === "pending" ? -1 : 0) - (b.status === "pending" ? -1 : 0))} onDecide={(cid, a) => void decide(cid, a)} pendingId={deciding} />
      )}
    </div>
  );

  const historyPanel =
    resume.versions.length === 0 ? (
      <EmptyState icon={History} title={t("resume.historyEmpty")} headingLevel={3} className="py-6" />
    ) : (
      <ul className="space-y-2">
        {resume.versions.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-2 rounded-lg border bg-surface p-3">
            <div>
              <p className="font-medium">{t("resume.versionN", { n: v.version })} — {v.labelBn}</p>
              <p className="text-sm text-muted-foreground">{formatDateTimeBn(v.createdAt)}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setRestore(v)}>
              <RotateCcw aria-hidden />
              {t("resume.restore")}
            </Button>
          </li>
        ))}
      </ul>
    );

  const atsPanel = <AtsPanel resume={resume} content={content} onAddKeyword={(kw) => { update((c) => ({ ...c, skills: c.skills.includes(kw) ? c.skills : [...c.skills, kw] })); toast.success(t("resume.addedKeyword", { kw })); }} />;
  const preview = <ResumePreview content={content} update={update} />;

  return (
    <div>
      <title>{`${resume.title} · ${t("brand.name")}`}</title>
      <PageHeader
        back={{ href: "/resumes", label: t("resume.listTitle") }}
        title={resume.kind === "base" ? t("resume.base") : resume.title}
        description={
          <span className="flex flex-wrap items-center gap-x-3">
            {resume.jobTitleBn && resume.circularSlug && <Link href={`/jobs/${resume.circularSlug}`} className="text-primary hover:underline">{t("resume.forJob", { title: resume.jobTitleBn })}</Link>}
            <span role="status" aria-live="polite">{saveLabel}</span>
          </span>
        }
        actions={
          <Button
            variant="secondary"
            loading={downloading}
            onClick={async () => {
              setDownloading(true);
              const r = await downloadResumePdf(resume.id);
              setDownloading(false);
              if (!r.ok) return void toast.error(r.error.message_bn);
              const url = URL.createObjectURL(r.data.blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = r.data.fileName;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 2000);
              toast.success(t("resume.downloaded"));
            }}
          >
            <Download aria-hidden />
            {downloading ? t("resume.downloading") : t("resume.downloadPdf")}
          </Button>
        }
      />
      <p className="mb-4 text-sm text-muted-foreground">{t("resume.inlineHint")}</p>

      {isDesktop ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          {preview}
          <Tabs defaultValue="ats" className="lg:sticky lg:top-20 lg:self-start">
            <TabsList>
              <TabsTrigger value="ats">{t("resume.tabAts")}</TabsTrigger>
              <TabsTrigger value="changes">{t("resume.tabChanges")}{pending > 0 && <Badge size="sm" variant="ai">{toBnDigits(pending)}</Badge>}</TabsTrigger>
              <TabsTrigger value="history">{t("resume.tabHistory")}</TabsTrigger>
            </TabsList>
            <TabsContent value="ats" className="rounded-xl border bg-surface p-4">{atsPanel}</TabsContent>
            <TabsContent value="changes" className="rounded-xl border bg-surface p-4">{changesPanel}</TabsContent>
            <TabsContent value="history" className="rounded-xl border bg-surface p-4">{historyPanel}</TabsContent>
          </Tabs>
        </div>
      ) : (
        <Tabs defaultValue="resume">
          <TabsList>
            <TabsTrigger value="resume">{t("resume.tabResume")}</TabsTrigger>
            <TabsTrigger value="ats">{t("resume.tabScore")}</TabsTrigger>
            <TabsTrigger value="changes">{t("resume.tabChangesShort")}{pending > 0 && <Badge size="sm" variant="ai">{toBnDigits(pending)}</Badge>}</TabsTrigger>
            <TabsTrigger value="history">{t("resume.tabHistory")}</TabsTrigger>
          </TabsList>
          <TabsContent value="resume">{preview}</TabsContent>
          <TabsContent value="ats">{atsPanel}</TabsContent>
          <TabsContent value="changes">{changesPanel}</TabsContent>
          <TabsContent value="history">{historyPanel}</TabsContent>
        </Tabs>
      )}

      <ConfirmDialog
        open={!!restore}
        onOpenChange={(o) => !o && setRestore(null)}
        title={t("resume.restore")}
        description={restore ? t("resume.restoreConfirm", { label: `${t("resume.versionN", { n: restore.version })} — ${restore.labelBn}` }) : ""}
        pending={restoring}
        onConfirm={async () => {
          if (!restore) return;
          setRestoring(true);
          const r = await restoreResumeVersion(resume.id, restore.id, newIdempotencyKey());
          setRestoring(false);
          setRestore(null);
          if (r.ok) {
            applyServer(r.data);
            toast.success(t("resume.restored"));
          } else toast.error(r.error.message_bn);
        }}
      />
      <ConflictDialog
        open={conflict}
        onOpenChange={setConflict}
        changes={[{ field: "Resume", yours: t("states.conflictYours"), theirs: t("resume.updated", { when: formatRelativeBn(resume.updatedAt) }) }]}
        onReload={() => {
          setConflict(false);
          setSave("idle");
          void q.reload();
        }}
      />
    </div>
  );
}
