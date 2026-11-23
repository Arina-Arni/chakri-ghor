import type { Metadata } from "next";
import { messages, t } from "@/i18n";
import { PricingPlans } from "./pricing-plans";

export const metadata: Metadata = { title: t("nav.pricing") };

export default function PricingPage() {
  return (
    <div className="container-page py-10">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold">{t("pricing.title")}</h1>
        <p className="mt-2 text-lg text-muted-foreground">{t("pricing.sub")}</p>
      </div>
      <PricingPlans />
      <section className="mt-12 max-w-3xl" aria-labelledby="faq-h">
        <h2 id="faq-h" className="text-2xl font-bold">{t("pricing.faqTitle")}</h2>
        <div className="mt-4 divide-y rounded-xl border bg-surface">
          {messages.pricing.faq.map((f) => (
            <details key={f.q} className="group p-4">
              <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 font-semibold">
                {f.q}
                <span aria-hidden className="text-primary transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
