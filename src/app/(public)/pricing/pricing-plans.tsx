"use client";

import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { ErrorState } from "@/components/feedback/error-state";
import { CardsSkeleton } from "@/components/feedback/skeletons";
import { useSession } from "@/components/providers/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPlans } from "@/data";
import { formatMoneyBn } from "@/domain/bn";
import { useData } from "@/hooks/use-data";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { UsageFeature } from "@/types";

export function PricingPlans() {
  const q = useData(() => getPlans(), []);
  const { me } = useSession();
  if (q.status === "loading") return <div className="mt-8"><CardsSkeleton count={2} /></div>;
  if (q.status === "error") return <ErrorState className="mt-8" error={q.error} onRetry={q.reload} />;
  return (
    <ul className="mt-8 grid max-w-4xl gap-6 md:grid-cols-2">
      {q.data.map((p) => {
        const premium = p.id === "premium";
        const current = me?.planId === p.id;
        return (
          <li key={p.id} className={cn("flex flex-col rounded-2xl border bg-surface p-6 shadow-card", premium && "border-2 border-primary")}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-xl font-bold">
                {premium && <Sparkles className="size-5 text-ai" aria-hidden />}
                {p.nameBn}
              </h2>
              {current && <Badge variant="success">{t("pricing.current")}</Badge>}
            </div>
            <p className="mt-3">
              <span className="text-4xl font-bold tabular-nums">{formatMoneyBn(p.priceBdt)}</span>
              <span className="text-muted-foreground">{p.period === "day" ? t("pricing.perDay") : t("pricing.perMonth")}</span>
            </p>
            <ul className="mt-5 flex-1 space-y-2">
              {p.featuresBn.map((f) => (
                <li key={f} className="flex gap-2"><Check className="mt-1 size-4 shrink-0 text-success" aria-hidden />{f}</li>
              ))}
              {(Object.keys(p.quotas) as UsageFeature[]).map((k) => (
                <li key={k} className="flex gap-2 text-muted-foreground">
                  <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
                  {t("pricing.quotaLine", { n: p.quotas[k], feature: t(`enums.usageFeature.${k}`) })}
                </li>
              ))}
            </ul>
            <Button asChild className="mt-6" variant={premium ? "default" : "secondary"} size="lg">
              <Link href={me ? (premium ? "/billing" : "/dashboard") : "/signup"}>{premium ? t("pricing.startTrial") : t("pricing.startFree")}</Link>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
