"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, CreditCard, FlaskConical, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { ErrorState } from "@/components/feedback/error-state";
import { Notice } from "@/components/feedback/notice";
import { CardsSkeleton } from "@/components/feedback/skeletons";
import { PageHeader } from "@/components/layout/page-header";
import { useSession } from "@/components/providers/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { QuotaMeter } from "@/components/ui/stat-tile";
import { completeMockCheckout, getBilling, getPlans, setCancelAtPeriodEnd, startTrial } from "@/data";
import { formatDateBn, formatMoneyBn, formatTimeBn } from "@/domain/bn";
import { useData } from "@/hooks/use-data";
import { useMutation } from "@/hooks/use-mutation";
import { t } from "@/i18n";

const STATUS_TONE = { none: "neutral", trialing: "info", active: "success", past_due: "warning", grace: "warning", expired: "danger" } as const;

export function BillingScreen() {
  const q = useData(() => getBilling(), []);
  const { refresh } = useSession();
  const [cancelOpen, setCancelOpen] = useState(false);
  const trial = useMutation((k: string) => startTrial(k), { successMessage: t("billing.trialStarted"), onSuccess: (b) => { q.setData(b); void refresh(); } });
  const cancel = useMutation((k: string, v: boolean) => setCancelAtPeriodEnd(v, k), {
    successMessage: (b) => (b.subscription.cancelAtPeriodEnd ? t("billing.cancelled") : t("common.saved")),
    onSuccess: (b) => { q.setData(b); setCancelOpen(false); },
  });

  if (q.status === "loading") return (<><PageHeader title={t("billing.title")} /><CardsSkeleton count={2} /></>);
  if (q.status === "error") return (<><PageHeader title={t("billing.title")} /><ErrorState error={q.error} onRetry={q.reload} /></>);
  const { subscription: s, usage, plans } = q.data;
  const plan = plans.find((p) => p.id === s.planId)!;
  const premium = s.planId === "premium" && ["trialing", "active", "grace"].includes(s.status);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t("billing.title")} />
      <Card>
        <CardHeader title={t("billing.currentPlan")} />
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-2xl font-bold">{premium && <Sparkles className="size-6 text-ai" aria-hidden />}{plan.nameBn}</span>
          <Badge variant={STATUS_TONE[s.status]}>{t(`enums.subscriptionStatus.${s.status}`)}</Badge>
          {s.cancelAtPeriodEnd && <Badge variant="warning">{t("billing.cancelled")}</Badge>}
        </div>
        <p className="mt-2 text-muted-foreground">
          {s.status === "trialing" && s.trialEndsAt && t("billing.trialEnds", { date: formatDateBn(s.trialEndsAt) })}
          {s.status === "active" && s.currentPeriodEnd && (s.cancelAtPeriodEnd ? t("billing.endsOn", { date: formatDateBn(s.currentPeriodEnd) }) : t("billing.renews", { date: formatDateBn(s.currentPeriodEnd) }))}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {s.status === "none" && !s.trialUsed && <Button loading={trial.pending} onClick={() => void trial.run()}><Sparkles aria-hidden />{t("billing.startTrial")}</Button>}
          {s.status !== "active" && <Button asChild variant={s.status === "none" && !s.trialUsed ? "secondary" : "default"}><Link href="/billing/checkout/mock"><CreditCard aria-hidden />{t("billing.upgrade")} ({formatMoneyBn(plans.find((p) => p.id === "premium")!.priceBdt)}{t("pricing.perDay")})</Link></Button>}
          {premium && !s.cancelAtPeriodEnd && <Button variant="ghost" onClick={() => setCancelOpen(true)}>{t("billing.cancel")}</Button>}
          {premium && s.cancelAtPeriodEnd && <Button variant="secondary" loading={cancel.pending} onClick={() => void cancel.run(false)}>{t("billing.resume")}</Button>}
        </div>
      </Card>
      <Card>
        <CardHeader title={t("billing.usageTitle")} description={usage[0] ? t("billing.resets", { time: formatTimeBn(usage[0].resetsAt) }) : undefined} />
        <div className="space-y-4">
          {usage.map((u) => (
            <QuotaMeter key={u.feature} label={t(`enums.usageFeature.${u.feature}`)} used={u.used} limit={u.limit} />
          ))}
        </div>
      </Card>
      <ConfirmDialog open={cancelOpen} onOpenChange={setCancelOpen} title={t("billing.cancel")} description={t("billing.cancelConfirm")} pending={cancel.pending} destructive onConfirm={() => void cancel.run(true)} />
    </div>
  );
}

export function MockCheckoutScreen() {
  const plans = useData(() => getPlans(), []);
  const router = useRouter();
  const { refresh } = useSession();
  const [failed, setFailed] = useState(false);
  const pay = useMutation((k: string, outcome: "success" | "fail") => completeMockCheckout(outcome, k), {
    toastError: false,
    onSuccess: () => {
      toast.success(t("billing.paidToast"));
      void refresh();
      router.push("/billing");
    },
    onError: () => setFailed(true),
  });
  const premium = plans.status === "success" ? plans.data.find((p) => p.id === "premium") : null;
  return (
    <div className="mx-auto max-w-md space-y-5">
      <PageHeader title={t("billing.checkoutTitle")} back={{ href: "/billing", label: t("billing.title") }} />
      <div role="note" className="flex items-center gap-3 rounded-xl border-2 border-dashed border-warning bg-warning-soft p-4 font-semibold text-warning">
        <FlaskConical className="size-6 shrink-0" aria-hidden />
        {t("billing.checkoutBanner")}
      </div>
      <Card>
        <p className="text-muted-foreground">{t("pricing.premium")}</p>
        <p className="text-3xl font-bold">{premium ? t("billing.checkoutAmount", { amount: `${formatMoneyBn(premium.priceBdt * 30)} (৩০ দিন)` }) : "…"}</p>
        {failed && <Notice tone="danger" live className="mt-4">{t("billing.failedToast")}</Notice>}
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button size="lg" loading={pay.pending} onClick={() => { setFailed(false); void pay.run("success"); }}><CheckCircle2 aria-hidden />{t("billing.paySuccess")}</Button>
          <Button size="lg" variant="destructive-soft" disabled={pay.pending} onClick={() => { setFailed(false); void pay.run("fail"); }}><XCircle aria-hidden />{t("billing.payFail")}</Button>
        </div>
      </Card>
    </div>
  );
}
