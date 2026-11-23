"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Activity, AlertTriangle, Power } from "lucide-react";
import { toast } from "sonner";
import { type Column, DataTable } from "@/components/admin/data-table";
import { ErrorState } from "@/components/feedback/error-state";
import { Notice } from "@/components/feedback/notice";
import { CardsSkeleton, FormSkeleton } from "@/components/feedback/skeletons";
import { PageHeader } from "@/components/layout/page-header";
import { useSession } from "@/components/providers/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getAiHealth, getFeatureFlags, savePlanSettings, setFaultInjection, setFeatureFlag } from "@/data";
import { formatCountdownBn } from "@/domain/countdown";
import { useServerNow } from "@/domain/countdown/use-server-now";
import { formatDateTimeBn, formatNumberBn, toBnDigits } from "@/domain/bn";
import { useData } from "@/hooks/use-data";
import { newIdempotencyKey, useMutation } from "@/hooks/use-mutation";
import { t } from "@/i18n";
import { planQuotaSchema } from "@/schemas/admin";
import type { AiFeature, AiHealthStats, FaultMode, FeatureFlags } from "@/types";
import type { z } from "zod";

const FEATURES: AiFeature[] = ["search_parse", "cv_parse", "resume_tailor", "circular_extract"];
const MODES: FaultMode[] = ["timeout", "malformed_json", "wrong_schema", "hallucinated_values", "rate_limited_429", "server_error_500"];
const BREAKER = { closed: "success", open: "danger", half_open: "warning" } as const;

function mmss(ms: number) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return toBnDigits(`${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
}

export function AiHealthScreen() {
  const [period, setPeriod] = useState<"24h" | "7d">("24h");
  const q = useData(() => getAiHealth(period), [period]);
  const now = useServerNow(1000);
  const [feature, setFeature] = useState<AiFeature>("search_parse");
  const [mode, setMode] = useState<FaultMode>("timeout");
  const fault = useMutation((_k: string, on: boolean) => setFaultInjection(on ? feature : null, on ? mode : null), {
    successMessage: (d) => (d ? t("admin.aiHealth.enabled") : t("admin.aiHealth.disabled")),
    onSuccess: (d) => {
      q.setData((h) => ({ ...h, faultInjection: d }));
      window.dispatchEvent(new Event("cr:fault-changed"));
    },
  });

  const failCols: Column<AiHealthStats["failures"][number]>[] = [
    { id: "at", header: t("admin.aiHealth.colTime"), sortValue: (f) => f.at, cell: (f) => <span className="whitespace-nowrap">{formatDateTimeBn(f.at)}</span> },
    { id: "feature", header: t("admin.aiHealth.colFeature"), primary: true, sortValue: (f) => f.feature, cell: (f) => t(`enums.aiFeature.${f.feature}`) },
    { id: "outcome", header: t("admin.aiHealth.colOutcome"), sortValue: (f) => f.outcome, cell: (f) => <Badge size="sm" variant={f.outcome === "fallback" ? "info" : "danger"}>{t(`enums.faultMode.${f.outcome}`)}</Badge> },
    { id: "attempts", header: t("admin.aiHealth.colAttempts"), sortValue: (f) => f.attempts, cell: (f) => toBnDigits(f.attempts) },
    { id: "latency", header: t("admin.aiHealth.colLatency"), sortValue: (f) => f.latencyMs, cell: (f) => t("admin.aiHealth.ms", { n: formatNumberBn(f.latencyMs) }) },
    { id: "msg", header: t("admin.aiHealth.colMessage"), cell: (f) => <span className="font-mono text-xs" lang="en">{f.message}</span> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("admin.aiHealth.title")} actions={<Segmented label={t("admin.aiHealth.title")} value={period} onChange={setPeriod} options={[{ value: "24h", label: t("admin.aiHealth.period24h") }, { value: "7d", label: t("admin.aiHealth.period7d") }]} />} />
      {q.status === "loading" ? <CardsSkeleton count={4} /> : q.status === "error" ? <ErrorState error={q.error} onRetry={q.reload} /> : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {q.data.features.map((f) => {
              const left = f.breaker.reopensAt && now != null ? new Date(f.breaker.reopensAt).getTime() - now : null;
              return (
                <li key={f.feature}>
                  <Card className="h-full space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-semibold">{t(`enums.aiFeature.${f.feature}`)}</h2>
                      <Activity className="size-5 text-primary" aria-hidden />
                    </div>
                    <p className="text-sm text-muted-foreground">{t("admin.aiHealth.calls", { n: formatNumberBn(f.calls) })}</p>
                    <dl className="grid grid-cols-3 gap-2 text-center">
                      <div><dt className="text-xs text-muted-foreground">{t("admin.aiHealth.success")}</dt><dd className="text-lg font-bold text-success tabular-nums">{toBnDigits(f.successPct)}%</dd></div>
                      <div><dt className="text-xs text-muted-foreground">{t("admin.aiHealth.fallback")}</dt><dd className="text-lg font-bold text-warning tabular-nums">{toBnDigits(f.fallbackPct)}%</dd></div>
                      <div><dt className="text-xs text-muted-foreground">{t("admin.aiHealth.p95")}</dt><dd className="text-lg font-bold tabular-nums">{toBnDigits((f.p95Ms / 1000).toFixed(1))}s</dd></div>
                    </dl>
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-muted-foreground">{t("admin.aiHealth.breaker")}:</span>
                      <Badge size="sm" variant={BREAKER[f.breaker.state]}>{f.breaker.state === "open" && <AlertTriangle aria-hidden />}{t(`enums.breaker.${f.breaker.state}`)}</Badge>
                      {f.breaker.state === "open" && left != null && left > 0 && <span className="text-danger tabular-nums">{t("admin.aiHealth.reopensIn", { time: mmss(left) })}</span>}
                    </p>
                  </Card>
                </li>
              );
            })}
          </ul>

          <Card aria-labelledby="fi-h" className="border-warning/40">
            <CardHeader id="fi-h" title={t("admin.aiHealth.faultTitle")} description={t("admin.aiHealth.faultBody")} />
            {!q.data.faultInjectionAllowed ? <Notice tone="info">{t("admin.aiHealth.notAllowed")}</Notice> : q.data.faultInjection ? (
              <Notice tone="warning" live title={t("admin.aiHealth.banner", { feature: t(`enums.aiFeature.${q.data.faultInjection.feature}`), mode: q.data.faultInjection.mode, time: now != null ? formatCountdownBn(Math.max(0, new Date(q.data.faultInjection.expiresAt).getTime() - now)) || mmss(0) : "" })} action={<Button size="sm" variant="secondary" loading={fault.pending} onClick={() => void fault.run(false)}><Power aria-hidden />{t("admin.aiHealth.disable")}</Button>} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <div>
                  <label htmlFor="fi-feature" className="font-medium">{t("admin.aiHealth.feature")}</label>
                  <Select value={feature} onValueChange={(v) => setFeature(v as AiFeature)}><SelectTrigger id="fi-feature" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{FEATURES.map((f) => <SelectItem key={f} value={f}>{t(`enums.aiFeature.${f}`)}</SelectItem>)}</SelectContent></Select>
                </div>
                <div>
                  <label htmlFor="fi-mode" className="font-medium">{t("admin.aiHealth.mode")}</label>
                  <Select value={mode} onValueChange={(v) => setMode(v as FaultMode)}><SelectTrigger id="fi-mode" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{MODES.map((m) => <SelectItem key={m} value={m}><span lang="en">{m}</span> — {t(`enums.faultMode.${m}`)}</SelectItem>)}</SelectContent></Select>
                </div>
                <Button variant="destructive" loading={fault.pending} onClick={() => void fault.run(true)}><AlertTriangle aria-hidden />{t("admin.aiHealth.enable")}</Button>
              </div>
            )}
          </Card>

          <section aria-labelledby="fail-h">
            <h2 id="fail-h" className="mb-3 text-xl font-semibold">{t("admin.aiHealth.failures")}</h2>
            <DataTable caption={t("admin.aiHealth.failures")} columns={failCols} rows={q.data.failures} rowKey={(f) => f.id} status="success" initialSort={{ id: "at", dir: "desc" }} />
          </section>
        </>
      )}
    </div>
  );
}

type QuotaIn = z.input<typeof planQuotaSchema>;

export function AdminSettingsScreen() {
  const q = useData(() => getFeatureFlags(), []);
  const { role } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const form = useForm<QuotaIn, unknown, z.output<typeof planQuotaSchema>>({
    resolver: zodResolver(planQuotaSchema),
    values:
      q.status === "success"
        ? {
            freeAiSearch: toBnDigits(q.data.quotas.free.aiSearchPerDay),
            freeTailor: toBnDigits(q.data.quotas.free.resumeTailorPerDay),
            freeCvParse: toBnDigits(q.data.quotas.free.cvParsePerDay),
            premiumAiSearch: toBnDigits(q.data.quotas.premium.aiSearchPerDay),
            premiumTailor: toBnDigits(q.data.quotas.premium.resumeTailorPerDay),
            premiumCvParse: toBnDigits(q.data.quotas.premium.cvParsePerDay),
            premiumPriceBdt: toBnDigits(q.data.premiumPriceBdt),
          }
        : undefined,
  });
  const save = useMutation(
    (k: string, v: z.output<typeof planQuotaSchema>) =>
      savePlanSettings(
        {
          free: { aiSearchPerDay: v.freeAiSearch, resumeTailorPerDay: v.freeTailor, cvParsePerDay: v.freeCvParse },
          premium: { aiSearchPerDay: v.premiumAiSearch, resumeTailorPerDay: v.premiumTailor, cvParsePerDay: v.premiumCvParse },
        },
        v.premiumPriceBdt,
        k,
      ),
    { successMessage: t("admin.settings.quotaSaved"), onSuccess: (d) => q.setData(d) },
  );
  if (q.status === "loading") return (<><PageHeader title={t("admin.settings.title")} /><FormSkeleton /></>);
  if (q.status === "error") return (<><PageHeader title={t("admin.settings.title")} /><ErrorState error={q.error} onRetry={q.reload} /></>);
  const flags: (keyof FeatureFlags)[] = ["autoPublish", "aiSearch", "aiCvParse", "aiResumeTailor", "aiCircularExtract"];
  const { errors } = form.formState;
  const disabled = role !== "admin";
  const qf = (name: keyof QuotaIn, label: string) => (
    <Field id={`q-${name}`} label={label} error={errors[name]?.message}><Input inputMode="numeric" disabled={disabled} {...form.register(name)} /></Field>
  );
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t("admin.settings.title")} />
      {disabled && <Notice tone="info">{t("admin.users.adminOnly")}</Notice>}
      <Card>
        <CardHeader title={t("admin.settings.flags")} />
        <ul className="divide-y">
          {flags.map((f) => (
            <li key={f} className="flex min-h-14 items-center justify-between gap-3">
              <label htmlFor={`f-${f}`} className="font-medium">{t(`admin.settings.${f}`)}</label>
              <Switch
                id={`f-${f}`}
                checked={q.data.flags[f]}
                disabled={disabled || busy != null}
                onCheckedChange={async (v) => {
                  setBusy(f);
                  const r = await setFeatureFlag(f, v, newIdempotencyKey());
                  setBusy(null);
                  if (r.ok) { q.setData(r.data); toast.success(t("admin.settings.flagSaved")); } else toast.error(r.error.message_bn);
                }}
              />
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title={t("admin.settings.quotas")} />
        <form noValidate className="space-y-4" onSubmit={form.handleSubmit((v) => void save.run(v))}>
          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="mb-2 font-semibold">{t("pricing.free")}</legend>
            {qf("freeAiSearch", t("enums.usageFeature.ai_search"))}
            {qf("freeTailor", t("enums.usageFeature.resume_tailor"))}
            {qf("freeCvParse", t("enums.usageFeature.cv_parse"))}
          </fieldset>
          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="mb-2 font-semibold">{t("pricing.premium")}</legend>
            {qf("premiumAiSearch", t("enums.usageFeature.ai_search"))}
            {qf("premiumTailor", t("enums.usageFeature.resume_tailor"))}
            {qf("premiumCvParse", t("enums.usageFeature.cv_parse"))}
          </fieldset>
          <div className="max-w-xs">{qf("premiumPriceBdt", t("admin.settings.premiumPrice"))}</div>
          <Button type="submit" loading={save.pending} disabled={disabled}>{t("common.save")}</Button>
        </form>
      </Card>
    </div>
  );
}
