import { formatDateBn } from "@/domain/bn";
import { t } from "@/i18n";

/** Readable long-form layout for legal and about pages. */
export function ProsePage({ title, sections }: { title: string; sections: readonly { h: string; p: string }[] }) {
  return (
    <article className="container-page max-w-3xl py-10">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("legal.updated", { date: formatDateBn("2026-11-20T06:00:00Z") })}</p>
      <div className="mt-8 space-y-8">
        {sections.map((s) => (
          <section key={s.h}>
            <h2 className="text-xl font-semibold">{s.h}</h2>
            <p className="mt-2 max-w-[65ch] text-lg leading-relaxed text-ink/90">{s.p}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
