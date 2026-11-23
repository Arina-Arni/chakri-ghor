"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BellPlus, SearchX, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { FilterPanel } from "@/components/jobs/filter-panel";
import { JobCard } from "@/components/jobs/job-card";
import { SearchBar, type SearchMode } from "@/components/jobs/search-bar";
import { AiFallbackNotice, AiProgress, QuotaNotice } from "@/components/feedback/ai-status";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Notice } from "@/components/feedback/notice";
import { JobListSkeleton } from "@/components/feedback/skeletons";
import { useSession } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";
import { AiChip, Chip } from "@/components/ui/chip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { filterValueLabel, getFacets, getZeroResultSuggestions, listCirculars, parseSearchQuery, saveSearch } from "@/data";
import { toBnDigits } from "@/domain/bn";
import { useData } from "@/hooks/use-data";
import { useMutation } from "@/hooks/use-mutation";
import { t } from "@/i18n";
import { activeFilterCount, filtersKey, filtersToParams, parseFilters, removeFilter } from "@/lib/job-filters";
import type { ApiError, CircularListItem, JobFilters, JobSort, ParsedSearch } from "@/types";

type AiState =
  | { status: "idle" }
  | { status: "parsing"; text: string }
  | { status: "done"; text: string; result: ParsedSearch }
  | { status: "quota"; text: string; error: ApiError }
  | { status: "failed"; text: string };

const SORTS: JobSort[] = ["deadline", "newest", "salary", "vacancies", "relevance"];

function Results({ filters, onApply }: { filters: JobFilters; onApply: (f: JobFilters) => void }) {
  const first = useData(() => listCirculars(filters, null), []);
  const [more, setMore] = useState<CircularListItem[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const suggestions = useData(
    () => (first.status === "success" && first.data.total === 0 ? getZeroResultSuggestions(filters) : Promise.resolve({ ok: true as const, data: [] })),
    [first.status],
  );

  if (first.status === "loading") return <JobListSkeleton count={4} />;
  if (first.status === "error") return <ErrorState error={first.error} onRetry={first.reload} />;

  const page = first.data;
  const items = [...page.items, ...more];
  const next = cursor === undefined ? page.nextCursor : cursor;

  return (
    <div>
      <p className="mb-3 font-semibold text-ink" role="status" aria-live="polite">
        {t("jobs.resultCount", { n: page.total })}
      </p>
      {items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={t("jobs.emptyTitle")}
          body={t("jobs.emptyBody")}
          action={
            suggestions.status === "success" && suggestions.data.length > 0
              ? suggestions.data.slice(0, 4).map((s) => (
                  <Button key={`${s.key}-${s.value}`} variant="secondary" onClick={() => onApply(removeFilter(filters, s.key, s.value))}>
                    {t("jobs.suggestion", { label: s.labelBn, n: s.resultCount })}
                  </Button>
                ))
              : undefined
          }
        />
      ) : (
        <>
          <ul className="grid gap-4">
            {items.map((job) => (
              <li key={job.id}>
                <JobCard job={job} />
              </li>
            ))}
          </ul>
          <div className="mt-6 flex justify-center">
            {next ? (
              <Button
                variant="secondary"
                loading={loadingMore}
                onClick={async () => {
                  setLoadingMore(true);
                  const r = await listCirculars(filters, next);
                  setLoadingMore(false);
                  if (r.ok) {
                    setMore((m) => [...m, ...r.data.items]);
                    setCursor(r.data.nextCursor);
                  } else toast.error(r.error.message_bn);
                }}
              >
                {loadingMore ? t("jobs.loadingMore") : t("jobs.loadMore")}
              </Button>
            ) : (
              <p className="text-muted-foreground">{t("jobs.endOfList")}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MobileFilters({ open, onOpenChange, filters, onApply, signedIn }: { open: boolean; onOpenChange: (o: boolean) => void; filters: JobFilters; onApply: (f: JobFilters) => void; signedIn: boolean }) {
  const [draft, setDraft] = useState(filters);
  const facets = useData(() => getFacets(draft), [filtersKey(draft), open]);
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (o) setDraft(filters);
        onOpenChange(o);
      }}
    >
      <SheetContent side="bottom" className="max-h-[90dvh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{t("jobs.filtersTitle")}</SheetTitle>
          <SheetDescription className="sr-only">{t("jobs.filtersTitle")}</SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto px-4">
          <FilterPanel facets={facets.data ?? null} filters={draft} onChange={setDraft} signedIn={signedIn} />
        </div>
        <SheetFooter className="flex-row border-t">
          <Button variant="ghost" onClick={() => setDraft({ q: filters.q, sort: filters.sort })}>
            {t("jobs.clearAll")}
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              onApply(draft);
              onOpenChange(false);
            }}
          >
            {t("jobs.showResults", { n: facets.data?.total ?? 0 })}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function JobsScreen() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const spKey = sp.toString();
  const filters = useMemo(() => parseFilters(new URLSearchParams(spKey)), [spKey]);
  const key = filtersKey(filters);
  const viaAi = sp.get("via") === "ai";
  const aiRequested = sp.get("ai") === "1";
  const { role } = useSession();
  const signedIn = role !== "guest";
  const [mode, setMode] = useState<SearchMode>(aiRequested || viaAi ? "ai" : "normal");
  const [ai, setAi] = useState<AiState>({ status: "idle" });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const handled = useRef<string | null>(null);
  const facets = useData(() => getFacets(filters), [key]);

  const go = (f: JobFilters, opts: { replace?: boolean; via?: boolean } = {}) => {
    const p = filtersToParams(f);
    if (opts.via) p.set("via", "ai");
    const preview = sp.get("__state");
    if (preview) p.set("__state", preview);
    const url = `${pathname}${p.size ? `?${p}` : ""}`;
    if (opts.replace) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  };

  // AI query understanding: ?q=…&ai=1 → parse → replace the URL with real filters.
  useEffect(() => {
    if (!aiRequested || !filters.q || handled.current === spKey) return;
    const text = filters.q;
    let alive = true;
    void Promise.resolve()
      .then(() => {
        if (alive) setAi({ status: "parsing", text });
        return parseSearchQuery(text);
      })
      .then((r) => {
        if (!alive) return;
        handled.current = spKey;
        if (r.ok) {
          setAi({ status: "done", text, result: r.data });
          go({ ...r.data.filters, sort: r.data.mode === "ai" ? "relevance" : undefined }, { replace: true, via: true });
        } else if (r.error.code === "QUOTA_EXCEEDED") {
          setAi({ status: "quota", text, error: r.error });
          go({ q: text }, { replace: true });
        } else {
          setAi({ status: "failed", text });
          go({ q: text }, { replace: true });
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiRequested, spKey]);

  const save = useMutation((k: string, name: string) => saveSearch(name, filters, k), {
    successMessage: t("jobs.saveSearchDone"),
    onSuccess: () => setSaveOpen(false),
  });

  const activeChips: { key: keyof JobFilters; value: string | null; label: string }[] = [];
  (["division", "district", "sector", "category", "organization", "education", "jobType", "workMode", "status"] as const).forEach((k) =>
    (filters[k] as string[] | undefined)?.forEach((v) => activeChips.push({ key: k, value: v, label: filterValueLabel(k, v) })),
  );
  if (filters.salaryMin) activeChips.push({ key: "salaryMin", value: null, label: filterValueLabel("salaryMin", String(filters.salaryMin)) });
  if (filters.salaryMax) activeChips.push({ key: "salaryMax", value: null, label: filterValueLabel("salaryMax", String(filters.salaryMax)) });
  if (filters.deadlineWithin) activeChips.push({ key: "deadlineWithin", value: null, label: `${t("jobs.facets.deadlineWithin")}: ${filterValueLabel("deadlineWithin", filters.deadlineWithin)}` });
  if (filters.eligibleOnly) activeChips.push({ key: "eligibleOnly", value: null, label: t("jobs.eligibleOnly") });

  const aiResult = ai.status === "done" && viaAi ? ai.result : null;
  const count = activeFilterCount(filters);

  return (
    <div className="container-page py-6 md:py-8">
      <h1 className="text-2xl font-bold md:text-3xl">{t("jobs.title")}</h1>
      <div className="mt-4 max-w-3xl">
        <SearchBar
          mode={mode}
          onModeChange={setMode}
          initialValue={ai.status !== "idle" ? ai.text : (filters.q ?? "")}
          busy={ai.status === "parsing"}
          onSubmit={(text, m) => {
            if (m === "ai" && text) {
              const p = new URLSearchParams({ q: text, ai: "1" });
              const preview = sp.get("__state");
              if (preview) p.set("__state", preview);
              router.push(`${pathname}?${p}`, { scroll: false });
            } else go({ ...filters, q: text || undefined });
          }}
        />
      </div>

      <div className="mt-4 max-w-3xl space-y-3" aria-live="polite">
        {ai.status === "parsing" && <AiProgress text={t("search.aiParsing")} />}
        {aiResult && aiResult.mode === "fallback" && <AiFallbackNotice text={t("search.fallback")} />}
        {ai.status === "failed" && <AiFallbackNotice text={t("search.fallback")} />}
        {aiResult && aiResult.mode === "ai" && aiResult.confidence < 0.6 && <Notice tone="warning">{t("search.lowConfidence")}</Notice>}
        {ai.status === "quota" &&
          (ai.error.fields?.audience === "guest" ? (
            <QuotaNotice guestMessage={t("search.quotaGuest")} />
          ) : (
            <QuotaNotice used={Number(ai.error.fields?.used)} limit={Number(ai.error.fields?.limit)} resetsAt={ai.error.fields?.resetsAt} />
          ))}
        {aiResult && aiResult.chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ai">{aiResult.mode === "ai" ? t("search.aiUnderstood") : t("search.understood")}</span>
            {aiResult.chips.map((c) =>
              aiResult.mode === "ai" ? (
                <AiChip key={`${c.key}-${c.value}`} onRemove={() => go(removeFilter(filters, c.key, Array.isArray(filters[c.key]) ? c.value : null))}>
                  {c.labelBn}
                </AiChip>
              ) : (
                <Chip key={`${c.key}-${c.value}`} onRemove={() => go(removeFilter(filters, c.key, null))}>
                  {c.labelBn}
                </Chip>
              ),
            )}
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="hidden lg:block" aria-label={t("jobs.filtersTitle")}>
          <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-xl border bg-surface p-4 shadow-card">
            <h2 className="mb-3 text-lg font-semibold">{t("jobs.filtersTitle")}</h2>
            <FilterPanel facets={facets.data ?? null} filters={filters} onChange={(f) => go(f)} signedIn={signedIn} />
          </div>
        </aside>

        <section aria-labelledby="results-h">
          <h2 id="results-h" className="sr-only">{t("jobs.resultCount", { n: facets.data?.total ?? 0 })}</h2>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button variant="secondary" className="lg:hidden" onClick={() => setSheetOpen(true)}>
              <SlidersHorizontal aria-hidden />
              {t("jobs.filtersButton", { n: count })}
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <label htmlFor="sort" className="text-sm text-muted-foreground">
                {t("jobs.sortLabel")}
              </label>
              <Select value={filters.sort ?? (filters.q ? "relevance" : "deadline")} onValueChange={(v) => go({ ...filters, sort: v as JobSort })}>
                <SelectTrigger id="sort" className="min-w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`enums.sort.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {signedIn && (
              <Button variant="ghost" onClick={() => setSaveOpen(true)}>
                <BellPlus aria-hidden />
                {t("jobs.saveSearch")}
              </Button>
            )}
          </div>

          {(activeChips.length > 0 || (filters.q && !aiResult)) && (
            <div className="mb-4 flex flex-wrap items-center gap-2" aria-label={t("jobs.activeFilters")}>
              {filters.q && !aiResult && <Chip onRemove={() => go({ ...filters, q: undefined })}>“{filters.q}”</Chip>}
              {!aiResult &&
                activeChips.map((c) => (
                  <Chip key={`${c.key}-${c.value}`} selected onRemove={() => go(removeFilter(filters, c.key, c.value))}>
                    {c.label}
                  </Chip>
                ))}
              {aiResult && activeChips.length > aiResult.chips.length && (
                <span className="text-sm text-muted-foreground">+{toBnDigits(activeChips.length - aiResult.chips.length)}</span>
              )}
              <Button variant="link" onClick={() => go({ sort: filters.sort })}>
                {t("jobs.clearAll")}
              </Button>
            </div>
          )}

          <Results key={key} filters={filters} onApply={(f) => go(f)} />
        </section>
      </div>

      <MobileFilters open={sheetOpen} onOpenChange={setSheetOpen} filters={filters} onApply={(f) => go(f)} signedIn={signedIn} />

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (saveName.trim().length >= 2) void save.run(saveName.trim());
            }}
            className="grid gap-4"
          >
            <DialogHeader>
              <DialogTitle>{t("jobs.saveSearch")}</DialogTitle>
              <DialogDescription>{activeChips.map((c) => c.label).join(" · ") || filters.q || t("common.all")}</DialogDescription>
            </DialogHeader>
            <Field id="save-name" label={t("jobs.saveSearchName")} required error={save.error?.fields?.name}>
              <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} autoFocus />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={save.pending} disabled={saveName.trim().length < 2}>
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
