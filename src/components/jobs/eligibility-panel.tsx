"use client";

import Link from "next/link";
import { CheckCircle2, CircleHelp, ClipboardCheck, LogIn, UserRoundPen, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/feedback/error-state";
import { useSession } from "@/components/providers/session-provider";
import { checkEligibility } from "@/data";
import { toBnDigits } from "@/domain/bn";
import { useData } from "@/hooks/use-data";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { Result } from "@/types";
import type { EligibilityResult } from "@/types";

const VERDICT = {
  eligible: { Icon: CheckCircle2, box: "border-success/30 bg-success-soft text-success", label: () => `✓ ${t("eligibility.eligible")}` },
  not_eligible: { Icon: XCircle, box: "border-danger/30 bg-danger-soft text-danger", label: () => `✗ ${t("eligibility.notEligible")}` },
  needs_info: { Icon: CircleHelp, box: "border-warning/30 bg-warning-soft text-warning", label: () => `? ${t("eligibility.needsInfo")}` },
} as const;

const ROW = {
  pass: { Icon: CheckCircle2, cls: "text-success", sr: () => t("eligibility.pass") },
  fail: { Icon: XCircle, cls: "text-danger", sr: () => t("eligibility.fail") },
  unknown: { Icon: CircleHelp, cls: "text-warning", sr: () => t("eligibility.unknown") },
} as const;

/** "আমি কি যোগ্য?" — guest, profile-incomplete, loading and three verdicts. Icons + text, never color alone. */
export function EligibilityPanel({ postId }: { postId: string }) {
  const { role, status } = useSession();
  const q = useData<EligibilityResult>(
    () => (role === "guest" ? Promise.resolve({ ok: false, error: { code: "UNAUTHENTICATED", message_bn: "" } } as Result<EligibilityResult>) : checkEligibility(postId)),
    [postId, role, status],
  );

  return (
    <section aria-labelledby="elig-title" className="rounded-xl border bg-surface p-4 shadow-card">
      <h2 id="elig-title" className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <ClipboardCheck className="size-5 text-primary" aria-hidden />
        {t("eligibility.title")}
      </h2>
      <div aria-live="polite">
        {(status === "loading" || q.status === "loading") && (
          <div role="status" aria-busy className="space-y-2">
            <span className="sr-only">{t("eligibility.checking")}</span>
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-5 w-3/5" />
          </div>
        )}
        {status === "ready" && q.status === "error" && q.error.code === "UNAUTHENTICATED" && (
          <div className="space-y-3">
            <p className="text-muted-foreground">{t("eligibility.guest")}</p>
            <Button asChild className="w-full">
              <Link href={`/login?next=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/jobs")}`}>
                <LogIn aria-hidden />
                {t("eligibility.guestCta")}
              </Link>
            </Button>
          </div>
        )}
        {q.status === "error" && q.error.code === "PROFILE_INCOMPLETE" && (
          <div className="space-y-3">
            <p className="text-muted-foreground">{t("eligibility.incomplete")}</p>
            <Button asChild className="w-full">
              <Link href="/onboarding">
                <UserRoundPen aria-hidden />
                {t("eligibility.incompleteCta")}
              </Link>
            </Button>
          </div>
        )}
        {q.status === "error" && !["UNAUTHENTICATED", "PROFILE_INCOMPLETE"].includes(q.error.code) && (
          <ErrorState compact error={q.error} onRetry={q.reload} />
        )}
        {q.status === "success" && (
          <div className="space-y-3">
            {(() => {
              const v = VERDICT[q.data.verdict];
              return (
                <p className={cn("flex items-center gap-2 rounded-lg border px-3 py-2.5 text-lg font-bold", v.box)}>
                  <v.Icon className="size-6" aria-hidden />
                  {v.label()}
                </p>
              );
            })()}
            {q.data.age && (
              <p className="text-ink">
                {t("eligibility.ageLine", { y: q.data.age.years, m: q.data.age.months, d: q.data.age.days })}
              </p>
            )}
            <ul className="divide-y">
              {q.data.checks.map((c) => {
                const r = ROW[c.status];
                return (
                  <li key={c.key} className="flex gap-3 py-2">
                    <r.Icon className={cn("mt-0.5 size-5 shrink-0", r.cls)} aria-hidden />
                    <div>
                      <p className="font-medium">
                        {t(`enums.eligibilityCheck.${c.key}`)}
                        <span className="sr-only"> — {r.sr()}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">{c.messageBn}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {q.data.manualChecks.length > 0 && (
              <div className="rounded-lg bg-info-soft p-3 text-sm">
                <p className="font-semibold text-info">{t("eligibility.manualTitle")}</p>
                <ul className="mt-1 list-disc pl-5 text-ink">
                  {q.data.manualChecks.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
            {q.data.checks.some((c) => c.status === "unknown") && (
              <Link href="/profile" className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline">
                <UserRoundPen className="size-4" aria-hidden />
                {t("eligibility.updateProfile")}
              </Link>
            )}
            <span className="sr-only">{toBnDigits(q.data.checks.length)}টি শর্ত যাচাই হয়েছে</span>
          </div>
        )}
      </div>
    </section>
  );
}
