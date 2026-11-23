import Link from "next/link";
import { Info } from "lucide-react";
import { USING_SAMPLE_DATA } from "@/data/_runtime";
import { t } from "@/i18n";
import { Logo } from "./logo";

export function Footer() {
  return (
    <footer className="mt-16 border-t bg-surface">
      <div className="container-page grid gap-8 py-10 md:grid-cols-[1.5fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-md text-muted-foreground">{t("landing.heroSub")}</p>
          <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("footer.disclaimer")}
          </p>
        </div>
        <nav aria-label="ফুটার">
          <ul className="grid grid-cols-2 gap-2">
            {[
              ["/about", t("footer.about")],
              ["/privacy", t("footer.privacy")],
              ["/terms", t("footer.terms")],
              ["mailto:hello@chakriradar.example", t("footer.contact")],
              ["/jobs", t("nav.jobs")],
              ["/pricing", t("nav.pricing")],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="inline-flex min-h-11 items-center text-ink underline-offset-4 hover:text-primary hover:underline">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t">
        <div className="container-page flex flex-wrap items-center justify-between gap-2 py-4 text-sm text-muted-foreground">
          <p>
            {t("footer.copyright", { year: 2026 })} · {t("footer.madeFor")}
          </p>
          {USING_SAMPLE_DATA && <p>নমুনা ডেটা — শুধু ডেমোর জন্য, আসল বিজ্ঞপ্তি নয়</p>}
        </div>
      </div>
    </footer>
  );
}
