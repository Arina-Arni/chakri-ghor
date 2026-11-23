"use client";

import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";
import { formatTimeBn } from "@/domain/bn";
import { t } from "@/i18n";
import { Notice } from "./notice";

/** "✦ AI কাজ করছে…" progress line, announced politely. */
export function AiProgress({ text = t("states.aiWorking") }: { text?: string }) {
  return (
    <p role="status" aria-live="polite" className="inline-flex items-center gap-2 font-medium text-ai">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {text}
    </p>
  );
}

/** Info notice shown when the AI path was not used. */
export function AiFallbackNotice({ text = t("states.aiFallback") }: { text?: string }) {
  return (
    <Notice tone="info" live>
      {text}
    </Notice>
  );
}

/** Quota notice: what's left and when it resets, with an upgrade link for signed-in users. */
export function QuotaNotice({
  used,
  limit,
  resetsAt,
  guestMessage,
}: {
  used?: number;
  limit?: number;
  resetsAt?: string;
  /** For guests: a sign-up prompt instead of counts. */
  guestMessage?: string;
}) {
  if (guestMessage) {
    return (
      <Notice
        tone="warning"
        live
        title={t("states.quotaTitle")}
        action={
          <Link href="/signup" className="font-semibold text-primary underline underline-offset-4">
            {t("nav.signup")}
          </Link>
        }
      >
        {guestMessage}
      </Notice>
    );
  }
  return (
    <Notice
      tone="warning"
      live
      title={t("states.quotaTitle")}
      action={
        <Link href="/pricing" className="inline-flex items-center gap-1 font-semibold text-primary underline underline-offset-4">
          <Sparkles className="size-4" aria-hidden />
          {t("states.upgrade")}
        </Link>
      }
    >
      {limit != null && (
        <span className="tabular-nums">
          {t("states.quotaLeft", { left: Math.max(0, limit - (used ?? limit)), limit })}
          {" · "}
        </span>
      )}
      {resetsAt ? t("billing.resets", { time: formatTimeBn(resetsAt) }) : null}
    </Notice>
  );
}
