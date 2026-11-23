"use client";

import { useId, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { inputClass } from "@/components/ui/input";
import { formatNumberBn, parseNumberInput, toBnDigits } from "@/domain/bn";
import { t } from "@/i18n";
import { toggleArrayValue, type ArrayFilterKey } from "@/lib/job-filters";
import { cn } from "@/lib/utils";
import type { FacetOption, Facets, JobFilters } from "@/types";

const VISIBLE = 5;

/** Checkbox list with counts and "আরও দেখুন"; long lists get a search box. */
export function FacetFilter({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: FacetOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [q, setQ] = useState("");
  const id = useId();
  const searchable = options.length > 8;
  const filtered = q ? options.filter((o) => o.labelBn.toLowerCase().includes(q.toLowerCase())) : options;
  const shown = expanded || q ? filtered : filtered.slice(0, VISIBLE);
  return (
    <fieldset className="border-b py-4 first:pt-0 last:border-0">
      <legend className="mb-2 font-semibold text-ink">{title}</legend>
      {searchable && (
        <>
          <label htmlFor={`${id}-q`} className="sr-only">
            {t("jobs.facetSearch", { label: title })}
          </label>
          <input
            id={`${id}-q`}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("jobs.facetSearch", { label: title })}
            className={cn(inputClass, "mb-2 h-10")}
          />
        </>
      )}
      <ul id={`${id}-list`} className="space-y-0.5">
        {shown.map((o) => {
          const cid = `${id}-${o.value}`;
          const checked = selected.includes(o.value);
          return (
            <li key={o.value}>
              <label htmlFor={cid} className={cn("flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-1 hover:bg-muted", o.count === 0 && !checked && "opacity-60")}>
                <Checkbox id={cid} checked={checked} onCheckedChange={() => onToggle(o.value)} />
                <span className="flex-1">{o.labelBn}</span>
                <span className="text-sm text-muted-foreground tabular-nums" aria-label={`${toBnDigits(o.count)}টি`}>
                  {formatNumberBn(o.count)}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {!q && filtered.length > VISIBLE && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`${id}-list`}
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 min-h-10 px-1 font-medium text-primary hover:underline"
        >
          {expanded ? t("jobs.facetShowLess") : `${t("jobs.facetShowMore")} (${toBnDigits(filtered.length - VISIBLE)})`}
        </button>
      )}
    </fieldset>
  );
}

function SalaryRange({ filters, onChange }: { filters: JobFilters; onChange: (f: JobFilters) => void }) {
  const id = useId();
  const [min, setMin] = useState(filters.salaryMin ? toBnDigits(filters.salaryMin) : "");
  const [max, setMax] = useState(filters.salaryMax ? toBnDigits(filters.salaryMax) : "");
  const commit = () => {
    const a = parseNumberInput(min);
    const b = parseNumberInput(max);
    onChange({ ...filters, salaryMin: a ?? undefined, salaryMax: b ?? undefined });
  };
  return (
    <fieldset className="border-b py-4">
      <legend className="mb-2 font-semibold text-ink">{t("jobs.facets.salary")}</legend>
      <form
        className="grid grid-cols-2 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <div>
          <label htmlFor={`${id}-min`} className="text-sm text-muted-foreground">
            {t("jobs.facets.salaryMin")}
          </label>
          <input id={`${id}-min`} inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} onBlur={commit} placeholder="৳" className={cn(inputClass, "h-10")} />
        </div>
        <div>
          <label htmlFor={`${id}-max`} className="text-sm text-muted-foreground">
            {t("jobs.facets.salaryMax")}
          </label>
          <input id={`${id}-max`} inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} onBlur={commit} placeholder="৳" className={cn(inputClass, "h-10")} />
        </div>
        <button type="submit" className="sr-only">
          {t("common.apply")}
        </button>
      </form>
    </fieldset>
  );
}

/** Every facet from spec §4.2. Used in the desktop sidebar and the mobile sheet. */
export function FilterPanel({
  facets,
  filters,
  onChange,
  signedIn,
}: {
  facets: Facets | null;
  filters: JobFilters;
  onChange: (f: JobFilters) => void;
  signedIn: boolean;
}) {
  const id = useId();
  const toggle = (k: ArrayFilterKey) => (v: string) => onChange(toggleArrayValue(filters, k, v));
  const group = (k: ArrayFilterKey, title: string) =>
    facets ? <FacetFilter key={k} title={title} options={facets[k]} selected={(filters[k] as string[]) ?? []} onToggle={toggle(k)} /> : null;

  return (
    <div aria-busy={!facets}>
      <div className="flex items-center justify-between gap-3 border-b pb-4">
        <label htmlFor={`${id}-elig`} className={cn("font-semibold", !signedIn && "text-muted-foreground")}>
          {t("jobs.eligibleOnly")}
          {!signedIn && <span className="block text-sm font-normal">{t("jobs.eligibleOnlyHint")}</span>}
        </label>
        <Switch id={`${id}-elig`} disabled={!signedIn} checked={!!filters.eligibleOnly} onCheckedChange={(v) => onChange({ ...filters, eligibleOnly: v || undefined })} />
      </div>
      <div className="pt-4">
        {!facets && <p className="py-6 text-muted-foreground" role="status">{t("common.loading")}</p>}
        {group("status", t("jobs.facets.status"))}
        {facets && (
          <fieldset className="border-b py-4">
            <legend className="mb-2 font-semibold text-ink">{t("jobs.facets.deadlineWithin")}</legend>
            <div role="radiogroup" className="flex flex-wrap gap-2">
              {[{ value: "", labelBn: t("common.all"), count: facets.total }, ...facets.deadlineWithin].map((o) => {
                const active = (filters.deadlineWithin ?? "") === o.value;
                return (
                  <button
                    key={o.value || "all"}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onChange({ ...filters, deadlineWithin: (o.value || undefined) as JobFilters["deadlineWithin"] })}
                    className={cn("min-h-10 rounded-full border px-3 text-sm font-medium", active ? "border-primary bg-primary-soft text-primary-hover" : "border-border bg-surface hover:bg-muted")}
                  >
                    {o.labelBn} <span className="tabular-nums text-muted-foreground">({formatNumberBn(o.count)})</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
        {group("division", t("jobs.facets.division"))}
        {group("district", t("jobs.facets.district"))}
        {group("sector", t("jobs.facets.sector"))}
        {group("category", t("jobs.facets.category"))}
        {group("organization", t("jobs.facets.organization"))}
        {group("education", t("jobs.facets.education"))}
        {group("jobType", t("jobs.facets.jobType"))}
        {group("workMode", t("jobs.facets.workMode"))}
        {facets && <SalaryRange key={`${filters.salaryMin}-${filters.salaryMax}`} filters={filters} onChange={onChange} />}
      </div>
      <span className="sr-only" aria-live="polite">
        {facets ? t("jobs.resultCount", { n: facets.total }) : ""}
      </span>
    </div>
  );
}
