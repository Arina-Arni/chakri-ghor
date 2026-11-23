"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3 } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { TableSkeleton } from "@/components/feedback/skeletons";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toBnDigits } from "@/domain/bn";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ApiError } from "@/types";

export type Column<T> = {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Enables sorting on this column. */
  sortValue?: (row: T) => string | number;
  /** Can be hidden from the column menu (default true). */
  hideable?: boolean;
  className?: string;
  /** Shown as the card title on mobile. */
  primary?: boolean;
};

/**
 * Sortable, paginated table with column visibility and row actions.
 * Below md it renders stacked cards instead of a table.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  status,
  error,
  onRetry,
  rowActions,
  toolbar,
  empty,
  pageSize = 10,
  initialSort,
}: {
  caption: string;
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (r: T) => string;
  status: "loading" | "success" | "error";
  error?: ApiError;
  onRetry?: () => void;
  rowActions?: (r: T) => React.ReactNode;
  toolbar?: React.ReactNode;
  empty?: React.ReactNode;
  pageSize?: number;
  initialSort?: { id: string; dir: "asc" | "desc" };
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const visible = columns.filter((c) => !hidden.includes(c.id));

  const sorted = useMemo(() => {
    if (!rows) return [];
    const col = sort && columns.find((c) => c.id === sort.id);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "bn");
      return sort!.dir === "asc" ? r : -r;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = sorted.slice(current * pageSize, current * pageSize + pageSize);

  const toggleSort = (id: string) => setSort((s) => (s?.id === id ? (s.dir === "asc" ? { id, dir: "desc" } : null) : { id, dir: "asc" }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        {toolbar}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto hidden md:inline-flex">
              <Columns3 aria-hidden />
              {t("common.columns")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t("common.columns")}</DropdownMenuLabel>
            {columns.filter((c) => c.hideable !== false).map((c) => (
              <DropdownMenuCheckboxItem
                key={c.id}
                checked={!hidden.includes(c.id)}
                onCheckedChange={(v) => setHidden((h) => (v ? h.filter((x) => x !== c.id) : [...h, c.id]))}
                onSelect={(e) => e.preventDefault()}
              >
                {c.header}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {status === "loading" ? (
        <TableSkeleton cols={Math.min(visible.length, 6)} />
      ) : status === "error" ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : sorted.length === 0 ? (
        empty ?? <EmptyState title={t("states.emptyTitle")} />
      ) : (
        <>
          {/* Desktop / tablet table */}
          <div className="hidden overflow-x-auto rounded-xl border bg-surface md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{caption}</caption>
              <thead className="border-b bg-muted/60">
                <tr>
                  {visible.map((c) => (
                    <th
                      key={c.id}
                      scope="col"
                      aria-sort={sort?.id === c.id ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                      className={cn("px-3 py-2 font-semibold whitespace-nowrap text-ink", c.className)}
                    >
                      {c.sortValue ? (
                        <button type="button" onClick={() => toggleSort(c.id)} className="inline-flex min-h-9 items-center gap-1 rounded hover:text-primary">
                          {c.header}
                          {sort?.id === c.id ? (sort.dir === "asc" ? <ArrowUp className="size-4" aria-hidden /> : <ArrowDown className="size-4" aria-hidden />) : <ArrowUpDown className="size-4 opacity-40" aria-hidden />}
                        </button>
                      ) : (
                        c.header
                      )}
                    </th>
                  ))}
                  {rowActions && (
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      {t("common.actions")}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {slice.map((r) => (
                  <tr key={rowKey(r)} className="border-b align-middle last:border-0 hover:bg-muted/30">
                    {visible.map((c) => (
                      <td key={c.id} className={cn("px-3 py-2.5", c.className)}>
                        {c.cell(r)}
                      </td>
                    ))}
                    {rowActions && <td className="px-3 py-2 text-right whitespace-nowrap">{rowActions(r)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden" aria-label={caption}>
            {slice.map((r) => {
              const primary = columns.find((c) => c.primary) ?? columns[0];
              return (
                <li key={rowKey(r)} className="rounded-xl border bg-surface p-4 shadow-card">
                  <div className="font-semibold">{primary.cell(r)}</div>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    {visible.filter((c) => c !== primary).map((c) => (
                      <div key={c.id} className="contents">
                        <dt className="text-muted-foreground">{c.header}</dt>
                        <dd className="min-w-0">{c.cell(r)}</dd>
                      </div>
                    ))}
                  </dl>
                  {rowActions && <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">{rowActions(r)}</div>}
                </li>
              );
            })}
          </ul>

          {pages > 1 && (
            <nav aria-label={t("common.page", { n: current + 1 })} className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground tabular-nums">
                {toBnDigits(current * pageSize + 1)}–{toBnDigits(Math.min(sorted.length, (current + 1) * pageSize))} / {toBnDigits(sorted.length)}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
                  <ChevronLeft aria-hidden />
                  {t("common.previous")}
                </Button>
                <Button variant="outline" size="sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                  {t("common.next")}
                  <ChevronRight aria-hidden />
                </Button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
