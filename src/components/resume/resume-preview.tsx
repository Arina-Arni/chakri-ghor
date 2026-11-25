"use client";

import { Plus, X } from "lucide-react";
import { t } from "@/i18n";
import type { ResumeContent } from "@/types";
import { InlineText } from "./inline-text";

type Update = (fn: (c: ResumeContent) => ResumeContent) => void;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-5 mb-1.5 border-b border-slate-300 pb-0.5 text-[13px] font-bold tracking-wider text-slate-900 uppercase">{children}</h2>;
}

function ListEditor({ items, onChange, label, addLabel }: { items: string[]; onChange: (v: string[]) => void; label: string; addLabel: string }) {
  return (
    <ul className="flex flex-wrap gap-x-1 gap-y-1">
      {items.map((s, i) => (
        <li key={`${s}-${i}`} className="group inline-flex items-center">
          <InlineText value={s} label={`${label} ${i + 1}`} onSave={(v) => onChange(v ? items.map((x, j) => (j === i ? v : x)) : items.filter((_, j) => j !== i))} />
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`${t("common.remove")}: ${s}`} className="grid size-6 place-items-center rounded text-slate-400 opacity-60 hover:bg-red-50 hover:text-red-700 group-hover:opacity-100">
            <X className="size-3" aria-hidden />
          </button>
          {i < items.length - 1 && <span aria-hidden className="text-slate-400">·</span>}
        </li>
      ))}
      <li>
        <button type="button" onClick={() => onChange([...items, "New item"])} className="inline-flex min-h-6 items-center gap-0.5 rounded px-1 text-[12px] text-primary hover:bg-primary-soft">
          <Plus className="size-3" aria-hidden />
          <span lang="bn">{addLabel}</span>
        </button>
      </li>
    </ul>
  );
}

/** A4-like English preview. Every text is editable in place. */
export function ResumePreview({ content: c, update }: { content: ResumeContent; update: Update }) {
  const set = <K extends keyof ResumeContent>(k: K, v: ResumeContent[K]) => update((x) => ({ ...x, [k]: v }));
  return (
    <div className="overflow-x-auto rounded-xl border bg-slate-100 p-2 sm:p-4">
      <article
        lang="en"
        aria-label={t("resume.previewLabel")}
        className="mx-auto aspect-[1/1.414] w-full max-w-[720px] min-w-[300px] bg-white p-5 font-latin text-[13px] leading-relaxed text-slate-800 shadow-raised sm:p-10"
      >
        <header className="text-center">
          <InlineText as="p" value={c.contact.fullName} label="Full name" className="text-2xl font-bold text-slate-900" onSave={(v) => update((x) => ({ ...x, contact: { ...x.contact, fullName: v } }))} />
          <InlineText as="p" value={c.headline} label="Headline" className="text-[14px] text-slate-600" onSave={(v) => set("headline", v)} />
          <p className="mt-1 flex flex-wrap justify-center gap-x-2 text-[12px] text-slate-600">
            {(["email", "phone", "location"] as const).map((k) => (
              <InlineText key={k} value={c.contact[k]} label={k} onSave={(v) => update((x) => ({ ...x, contact: { ...x.contact, [k]: v } }))} />
            ))}
            {c.contact.links.map((l, i) => (
              <InlineText key={i} value={l} label={`Link ${i + 1}`} onSave={(v) => update((x) => ({ ...x, contact: { ...x.contact, links: x.contact.links.map((y, j) => (j === i ? v : y)).filter(Boolean) } }))} />
            ))}
          </p>
        </header>

        <SectionTitle>Summary</SectionTitle>
        <InlineText as="p" multiline value={c.summary} label="Summary" onSave={(v) => set("summary", v)} />

        <SectionTitle>Skills</SectionTitle>
        <ListEditor items={c.skills} label="Skill" addLabel={t("resume.addSkill")} onChange={(v) => set("skills", v)} />

        <SectionTitle>Experience</SectionTitle>
        {c.experience.map((e, i) => (
          <div key={e.id} className="mb-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <p className="font-semibold text-slate-900">
                <InlineText value={e.title} label={`Experience ${i + 1} title`} onSave={(v) => update((x) => ({ ...x, experience: x.experience.map((y, j) => (j === i ? { ...y, title: v } : y)) }))} />
                {" — "}
                <InlineText value={e.organization} label={`Experience ${i + 1} organization`} onSave={(v) => update((x) => ({ ...x, experience: x.experience.map((y, j) => (j === i ? { ...y, organization: v } : y)) }))} />
              </p>
              <p className="text-[12px] text-slate-500">
                <InlineText value={e.startDate} label={`Experience ${i + 1} start`} onSave={(v) => update((x) => ({ ...x, experience: x.experience.map((y, j) => (j === i ? { ...y, startDate: v } : y)) }))} />
                {" – "}
                <InlineText value={e.endDate} label={`Experience ${i + 1} end`} onSave={(v) => update((x) => ({ ...x, experience: x.experience.map((y, j) => (j === i ? { ...y, endDate: v } : y)) }))} />
              </p>
            </div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {e.bullets.map((b, k) => (
                <li key={k}>
                  <InlineText
                    value={b}
                    label={`Experience ${i + 1} bullet ${k + 1}`}
                    onSave={(v) => update((x) => ({ ...x, experience: x.experience.map((y, j) => (j === i ? { ...y, bullets: v ? y.bullets.map((z, n) => (n === k ? v : z)) : y.bullets.filter((_, n) => n !== k) } : y)) }))}
                  />
                </li>
              ))}
              <li className="list-none">
                <button type="button" onClick={() => update((x) => ({ ...x, experience: x.experience.map((y, j) => (j === i ? { ...y, bullets: [...y.bullets, "Describe an achievement"] } : y)) }))} className="inline-flex min-h-6 items-center gap-0.5 rounded px-1 text-[12px] text-primary hover:bg-primary-soft">
                  <Plus className="size-3" aria-hidden />
                  <span lang="bn">{t("resume.addBullet")}</span>
                </button>
              </li>
            </ul>
          </div>
        ))}

        <SectionTitle>Education</SectionTitle>
        {c.education.map((e, i) => (
          <p key={e.id} className="mb-1">
            <InlineText value={e.degree} label={`Education ${i + 1} degree`} className="font-semibold text-slate-900" onSave={(v) => update((x) => ({ ...x, education: x.education.map((y, j) => (j === i ? { ...y, degree: v } : y)) }))} />
            {", "}
            <InlineText value={e.institution} label={`Education ${i + 1} institution`} onSave={(v) => update((x) => ({ ...x, education: x.education.map((y, j) => (j === i ? { ...y, institution: v } : y)) }))} />
            {" — "}
            <InlineText value={e.year} label={`Education ${i + 1} year`} onSave={(v) => update((x) => ({ ...x, education: x.education.map((y, j) => (j === i ? { ...y, year: v } : y)) }))} />
            {" · "}
            <InlineText value={e.result} label={`Education ${i + 1} result`} onSave={(v) => update((x) => ({ ...x, education: x.education.map((y, j) => (j === i ? { ...y, result: v } : y)) }))} />
          </p>
        ))}

        <SectionTitle>Certifications</SectionTitle>
        <ListEditor items={c.certifications} label="Certification" addLabel={t("common.add")} onChange={(v) => set("certifications", v)} />
        <SectionTitle>Languages</SectionTitle>
        <ListEditor items={c.languages} label="Language" addLabel={t("common.add")} onChange={(v) => set("languages", v)} />
      </article>
    </div>
  );
}
