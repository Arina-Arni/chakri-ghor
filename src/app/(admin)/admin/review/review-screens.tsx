"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Check, ClipboardCheck, FileText, PencilLine, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Notice } from "@/components/feedback/notice";
import { CardsSkeleton, DetailSkeleton } from "@/components/feedback/skeletons";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { decideReview, getReviewItem, listReviewQueue } from "@/data";
import { formatRelativeBn, toBnDigits } from "@/domain/bn";
import { useData } from "@/hooks/use-data";
import { newIdempotencyKey } from "@/hooks/use-mutation";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

const pct = (c: number) => Math.round(c * 100);

export function ReviewQueueScreen() {
  const q = useData(() => listReviewQueue(), []);
  return (
    <div>
      <PageHeader title={t("admin.review.title")} />
      {q.status === "loading" ? <CardsSkeleton count={2} /> : q.status === "error" ? <ErrorState error={q.error} onRetry={q.reload} /> : q.data.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title={t("admin.review.empty")} />
      ) : (
        <ul className="grid gap-3">
          {q.data.map((r) => (
            <li key={r.id}>
              <article className="relative flex flex-wrap items-center gap-3 rounded-xl border bg-surface p-4 shadow-card hover:border-primary">
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold"><Link href={`/admin/review/${r.id}`} className="after:absolute after:inset-0 after:content-[''] hover:underline">{r.titleBn}</Link></h2>
                  <p className="text-sm text-muted-foreground">{r.source} · {t("admin.review.waiting", { when: formatRelativeBn(r.waitingSince) })}</p>
                </div>
                <Badge variant={r.confidence < 0.7 ? "warning" : "success"}>
                  {r.confidence < 0.7 && <AlertTriangle aria-hidden />}
                  {t("admin.review.confidence", { pct: pct(r.confidence) })}
                </Badge>
                <span className="font-medium text-primary" aria-hidden>{t("admin.review.open")} →</span>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ReviewDetailScreen({ id }: { id: string }) {
  const q = useData(() => getReviewItem(id), [id]);
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonErr, setReasonErr] = useState<string | null>(null);
  const [pending, setPending] = useState<null | "approve" | "reject">(null);

  if (q.status === "loading") return <DetailSkeleton />;
  if (q.status === "error") return q.error.code === "NOT_FOUND" ? <EmptyState title={t("states.notFoundTitle")} action={<Button asChild><Link href="/admin/review">{t("admin.review.title")}</Link></Button>} /> : <ErrorState error={q.error} onRetry={q.reload} />;
  const item = q.data;

  const decide = async (decision: "approve" | "reject") => {
    if (decision === "reject" && reason.trim().length < 5) return setReasonErr(t("validation.reasonRequired"));
    setPending(decision);
    const r = await decideReview(item.id, decision, { reason: reason.trim() || undefined, fields: editing ? values : undefined }, newIdempotencyKey());
    setPending(null);
    if (r.ok) {
      toast.success(decision === "approve" ? t("admin.review.approved") : t("admin.review.rejected"));
      router.push("/admin/review");
    } else toast.error(r.error.message_bn, { description: r.error.requestId });
  };

  return (
    <div>
      <PageHeader title={item.titleBn} back={{ href: "/admin/review", label: t("admin.review.title") }} description={<>{item.source} · <Badge size="sm" variant={item.confidence < 0.7 ? "warning" : "success"}>{t("admin.review.confidence", { pct: pct(item.confidence) })}</Badge></>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="pdf-h" className="rounded-xl border bg-surface p-3">
          <h2 id="pdf-h" className="mb-2 flex items-center gap-2 font-semibold"><FileText className="size-5" aria-hidden />{t("admin.review.pdf")}</h2>
          {item.pdfUrl ? (
            <object data={item.pdfUrl} type="application/pdf" className="h-[60dvh] w-full rounded-lg border lg:h-[70dvh]" aria-label={t("admin.review.pdf")}>
              <a href={item.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">{t("detail.viewPdf")}</a>
            </object>
          ) : (
            <p className="rounded-lg bg-muted p-6 text-center text-muted-foreground">{t("admin.review.noPdf")}</p>
          )}
        </section>
        <section aria-labelledby="fields-h" className="space-y-4 rounded-xl border bg-surface p-4">
          <h2 id="fields-h" className="font-semibold">{t("admin.review.fields")}</h2>
          {item.fields.some((f) => f.confidence < 0.7) && <Notice tone="warning">{t("admin.review.lowConfHint")}</Notice>}
          <dl className="space-y-3">
            {item.fields.map((f) => {
              const low = f.confidence < 0.7;
              return (
                <div key={f.key} className={cn("rounded-lg border p-3", low && "border-warning/50 bg-warning-soft/60")}>
                  <dt className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <label htmlFor={`rf-${f.key}`} className="font-medium text-ink">{f.labelBn}</label>
                    <span className={cn("tabular-nums", low ? "font-semibold text-warning" : "text-muted-foreground")}>
                      {low && <AlertTriangle className="mr-1 inline size-4" aria-hidden />}
                      {low && `${t("admin.review.verify")} · `}{toBnDigits(pct(f.confidence))}%
                    </span>
                  </dt>
                  <dd className="mt-1">
                    {editing ? <Input id={`rf-${f.key}`} value={values[f.key] ?? f.value} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} /> : <span id={`rf-${f.key}`} className="font-medium">{f.value}</span>}
                  </dd>
                </div>
              );
            })}
          </dl>
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {editing ? (
              <Button loading={pending === "approve"} disabled={pending != null} onClick={() => void decide("approve")}><Check aria-hidden />{t("admin.review.editApprove")}</Button>
            ) : (
              <>
                <Button loading={pending === "approve"} disabled={pending != null} onClick={() => void decide("approve")}><Check aria-hidden />{t("admin.review.approve")}</Button>
                <Button variant="secondary" onClick={() => setEditing(true)}><PencilLine aria-hidden />{t("admin.review.editApprove")}</Button>
              </>
            )}
            <Button variant="destructive-soft" disabled={pending != null} onClick={() => setRejectOpen(true)}><X aria-hidden />{t("admin.review.reject")}</Button>
          </div>
        </section>
      </div>
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); void decide("reject"); }}>
            <DialogHeader>
              <DialogTitle>{t("admin.circulars.rejectTitle")}</DialogTitle>
              <DialogDescription>{item.titleBn}</DialogDescription>
            </DialogHeader>
            <Field id="rv-reason" label={t("admin.circulars.reason")} required error={reasonErr ?? undefined}><Textarea value={reason} onChange={(e) => { setReason(e.target.value); setReasonErr(null); }} /></Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" variant="destructive" loading={pending === "reject"}>{t("admin.review.reject")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
