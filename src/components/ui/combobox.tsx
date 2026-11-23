"use client";

import { useId, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Chip } from "@/components/ui/chip";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { FieldControlProps } from "./field";

export type ComboOption = {
  value: string;
  label: string;
  /** Extra strings to match: English names, Banglish spellings, aliases. */
  keywords?: string[];
  hint?: string;
};

type Common = Partial<FieldControlProps> & {
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
};

function OptionList({
  options,
  isSelected,
  onPick,
  search,
  setSearch,
  searchPlaceholder,
  allowCreate,
}: {
  options: ComboOption[];
  isSelected: (v: string) => boolean;
  onPick: (v: string) => void;
  search: string;
  setSearch: (s: string) => void;
  searchPlaceholder?: string;
  allowCreate?: boolean;
}) {
  const trimmed = search.trim();
  const exists = options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase());
  return (
    <Command>
      <CommandInput value={search} onValueChange={setSearch} placeholder={searchPlaceholder ?? t("common.searchPlaceholder")} />
      <CommandList className="max-h-72">
        <CommandEmpty>{t("common.noMatch")}</CommandEmpty>
        <CommandGroup>
          {allowCreate && trimmed && !exists && (
            <CommandItem value={`__create__${trimmed}`} keywords={[trimmed]} onSelect={() => onPick(trimmed)}>
              <Plus className="size-4" aria-hidden />
              {t("common.add")}: “{trimmed}”
            </CommandItem>
          )}
          {options.map((o) => (
            <CommandItem key={o.value} value={`${o.label} ${o.value}`} keywords={o.keywords} onSelect={() => onPick(o.value)}>
              <Check className={cn("size-4", isSelected(o.value) ? "opacity-100 text-primary" : "opacity-0")} aria-hidden />
              <span className="flex-1">{o.label}</span>
              {o.hint && <span className="text-sm text-muted-foreground">{o.hint}</span>}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

const triggerClass =
  "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-input bg-surface px-3 py-2 text-left text-base text-ink transition-colors hover:border-ink/50 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger";

/** Searchable single-select (districts, organizations…). Matches Bangla, English and Banglish aliases. */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = t("common.selectPlaceholder"),
  searchPlaceholder,
  disabled,
  className,
  ...aria
}: Common & { value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const listId = useId();
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" role="combobox" aria-expanded={open} aria-controls={listId} aria-haspopup="listbox" disabled={disabled} className={cn(triggerClass, className)} {...aria}>
          <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent id={listId} className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <OptionList
          options={options}
          isSelected={(v) => v === value}
          onPick={(v) => {
            onChange(v === value ? null : v);
            setOpen(false);
            setSearch("");
          }}
          search={search}
          setSearch={setSearch}
          searchPlaceholder={searchPlaceholder}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Multi-select with removable chips. `allowCreate` lets people add free text (skills, keywords). */
export function MultiCombobox({
  value,
  onChange,
  options,
  placeholder = t("common.selectPlaceholder"),
  searchPlaceholder,
  disabled,
  allowCreate,
  className,
  ...aria
}: Common & { value: string[]; onChange: (v: string[]) => void; allowCreate?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const listId = useId();
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className={cn("space-y-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" role="combobox" aria-expanded={open} aria-controls={listId} aria-haspopup="listbox" disabled={disabled} className={triggerClass} {...aria}>
            <span className="truncate text-muted-foreground">
              {value.length ? t("common.count", { n: value.length }) + " " + t("common.selectPlaceholder") : placeholder}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent id={listId} className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
          <OptionList
            options={options}
            isSelected={(v) => value.includes(v)}
            onPick={(v) => {
              toggle(v);
              setSearch("");
            }}
            search={search}
            setSearch={setSearch}
            searchPlaceholder={searchPlaceholder}
            allowCreate={allowCreate}
          />
        </PopoverContent>
      </Popover>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={placeholder}>
          {value.map((v) => (
            <li key={v}>
              <Chip selected onRemove={() => toggle(v)} removeLabel={t("search.removeChip", { label: labelOf(v) })}>
                {labelOf(v)}
              </Chip>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
