import Link from "next/link";
import { ArrowRight, BellRing, FileCheck2, KanbanSquare, Search, ShieldCheck, Sparkles, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { messages, t } from "@/i18n";
import { HeroSearch, LandingLive } from "./landing-client";

const HOW_ICONS = [Search, UserCheck, FileCheck2, KanbanSquare];
const FEATURE_ICONS = [Sparkles, ShieldCheck, FileCheck2, BellRing];

export default function LandingPage() {
  return (
    <>
      <section className="hero-surface bg-hero text-white" aria-labelledby="hero-title">
        <div className="container-page grid gap-8 py-12 md:py-20">
          <div className="max-w-3xl space-y-4">
            <h1 id="hero-title" className="text-3xl leading-tight font-bold md:text-4xl">
              {t("landing.heroTitle")}
            </h1>
            <p className="text-lg text-white/85">{t("landing.heroSub")}</p>
          </div>
          <HeroSearch />
        </div>
      </section>

      <LandingLive />

      <section className="container-page py-12" aria-labelledby="how-title">
        <h2 id="how-title" className="text-2xl font-bold">
          {t("landing.howTitle")}
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {messages.landing.how.map((s, i) => {
            const Icon = HOW_ICONS[i];
            return (
              <li key={s.title} className="relative rounded-xl border bg-surface p-5 shadow-card">
                <span className="mb-3 grid size-11 place-items-center rounded-full bg-primary-soft text-primary" aria-hidden>
                  <Icon className="size-5" />
                </span>
                <p className="text-sm font-semibold text-primary">ধাপ {"১২৩৪"[i]}</p>
                <h3 className="text-lg font-semibold">{s.title}</h3>
                <p className="mt-1 text-muted-foreground">{s.body}</p>
                {i < 3 && <ArrowRight className="absolute top-1/2 -right-3 hidden size-5 text-primary lg:block" aria-hidden />}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="bg-surface py-12" aria-labelledby="features-title">
        <div className="container-page">
          <h2 id="features-title" className="text-2xl font-bold">
            {t("landing.featuresTitle")}
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {messages.landing.features.map((f, i) => {
              const Icon = FEATURE_ICONS[i];
              return (
                <li key={f.title} className="flex gap-4 rounded-xl border p-5">
                  <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${i === 0 ? "bg-ai-soft text-ai" : "bg-primary-soft text-primary"}`} aria-hidden>
                    <Icon className="size-6" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold">{f.title}</h3>
                    <p className="text-muted-foreground">{f.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="container-page py-12" aria-labelledby="cta-title">
        <div className="flex flex-col items-start gap-4 rounded-2xl bg-primary p-8 text-primary-foreground md:flex-row md:items-center md:justify-between">
          <div>
            <h2 id="cta-title" className="text-2xl font-bold">
              {t("landing.ctaTitle")}
            </h2>
            <p className="mt-1 text-primary-foreground/90">{t("landing.ctaBody")}</p>
          </div>
          <Button asChild variant="hero" size="lg">
            <Link href="/signup">{t("landing.ctaButton")}</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
