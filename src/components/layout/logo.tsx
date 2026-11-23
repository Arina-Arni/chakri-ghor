import Link from "next/link";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/** Our own radar mark: concentric arcs + a dot. */
export function RadarMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <circle cx="16" cy="16" r="15" fill="currentColor" opacity="0.12" />
      <path d="M16 16 L16 4 A12 12 0 0 1 27.4 12.3 Z" fill="currentColor" opacity="0.28" />
      <circle cx="16" cy="16" r="11.5" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.55" />
      <circle cx="16" cy="16" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.8" />
      <circle cx="16" cy="16" r="2.6" fill="currentColor" />
      <circle cx="22.5" cy="9.5" r="1.8" fill="currentColor" />
    </svg>
  );
}

export function Logo({ tone = "default", href = "/", className }: { tone?: "default" | "light"; href?: string; className?: string }) {
  return (
    <Link
      href={href}
      aria-label={t("brand.logoAlt")}
      className={cn("inline-flex items-center gap-2 rounded-lg font-bold", tone === "light" ? "text-white" : "text-primary", className)}
    >
      <RadarMark />
      <span className={cn("text-xl tracking-tight", tone === "light" ? "text-white" : "text-ink")}>{t("brand.name")}</span>
    </Link>
  );
}
