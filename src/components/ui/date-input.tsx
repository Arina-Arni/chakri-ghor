"use client";

import { useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { inputClass } from "@/components/ui/input";
import { BN_MONTHS, dhakaParts, parseDateInput, toBnDigits } from "@/domain/bn";
import { serverNow } from "@/domain/countdown";
import { cn } from "@/lib/utils";
import type { FieldControlProps } from "./field";

const WEEKDAYS = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহঃ", "শুক্র", "শনি"];

type Ymd = { y: number; m: number; d: number };

function daysIn(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function shift(date: Ymd, days: number): Ymd {
  const t = new Date(Date.UTC(date.y, date.m - 1, date.d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}
function same(a: Ymd | null, b: Ymd) {
  return !!a && a.y === b.y && a.m === b.m && a.d === b.d;
}
const fmt = (v: Ymd) => toBnDigits(`${String(v.d).padStart(2, "0")}/${String(v.m).padStart(2, "0")}/${v.y}`);

/** Month grid with arrow-key navigation. Today is computed in Asia/Dhaka. */
function MiniCalendar({ selected, onPick }: { selected: Ymd | null; onPick: (v: Ymd) => void }) {
  const today = (() => {
    const p = dhakaParts(serverNow());
    return { y: p.year, m: p.month, d: p.day };
  })();
  const [focus, setFocus] = useState<Ymd>(selected ?? today);
  const gridRef = useRef<HTMLDivElement>(null);
  const first = new Date(Date.UTC(focus.y, focus.m - 1, 1)).getUTCDay();
  const total = daysIn(focus.y, focus.m);
  const cells: (Ymd | null)[] = [...Array(first).fill(null), ...Array.from({ length: total }, (_, i) => ({ y: focus.y, m: focus.m, d: i + 1 }))];

  const move = (days: number) => {
    const next = shift(focus, days);
    setFocus(next);
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${next.y}-${next.m}-${next.d}"]`)?.focus());
  };
  const monthShift = (n: number) => {
    const m0 = focus.m - 1 + n;
    const y = focus.y + Math.floor(m0 / 12);
    const m = ((m0 % 12) + 12) % 12 + 1;
    setFocus({ y, m, d: Math.min(focus.d, daysIn(y, m)) });
  };

  return (
    <div className="w-72 p-3">
      <div className="mb-2 flex items-center justify-between">
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => monthShift(-1)} aria-label="আগের মাস">
          <ChevronLeft aria-hidden />
        </Button>
        <p className="font-semibold" aria-live="polite">
          {BN_MONTHS[focus.m - 1]} {toBnDigits(focus.y)}
        </p>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => monthShift(1)} aria-label="পরের মাস">
          <ChevronRight aria-hidden />
        </Button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-muted-foreground" aria-hidden>
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div
        ref={gridRef}
        role="grid"
        aria-label={`${BN_MONTHS[focus.m - 1]} ${toBnDigits(focus.y)}`}
        className="grid grid-cols-7 gap-0.5"
        onKeyDown={(e) => {
          const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
          if (e.key in map) {
            e.preventDefault();
            move(map[e.key]);
          }
        }}
      >
        {cells.map((c, i) =>
          c ? (
            <button
              key={i}
              type="button"
              role="gridcell"
              data-day={`${c.y}-${c.m}-${c.d}`}
              tabIndex={same(focus, c) ? 0 : -1}
              aria-selected={same(selected, c)}
              aria-current={same(today, c) ? "date" : undefined}
              onClick={() => onPick(c)}
              className={cn(
                "grid size-9 place-items-center rounded-md text-sm tabular-nums hover:bg-primary-soft",
                same(today, c) && "font-bold text-primary",
                same(selected, c) && "bg-primary text-primary-foreground hover:bg-primary-hover",
              )}
            >
              {toBnDigits(c.d)}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
    </div>
  );
}

/** Date typed as দিন/মাস/বছর (Bangla or English digits) or picked from a calendar. */
export function DateInput({
  value,
  onChange,
  onBlur,
  disabled,
  className,
  placeholder = "দিন/মাস/বছর",
  ...aria
}: Partial<FieldControlProps> & {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const parsed = parseDateInput(value);
  const selected = "iso" in parsed ? (() => {
    const [y, m, d] = parsed.iso.split("-").map(Number);
    return { y, m, d };
  })() : null;
  return (
    <div className={cn("flex gap-2", className)}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(inputClass, "tabular-nums")}
        {...aria}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="icon" disabled={disabled} aria-label="ক্যালেন্ডার থেকে বেছে নিন">
            <CalendarDays aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <MiniCalendar
            selected={selected}
            onPick={(v) => {
              onChange(fmt(v));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Date + time in Asia/Dhaka. The time is 24 h "HH:mm" and accepts Bangla digits. */
export function DateTimeInput({
  value,
  onChange,
  disabled,
  id,
  ...aria
}: Partial<FieldControlProps> & {
  value: { date: string; time: string };
  onChange: (v: { date: string; time: string }) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_8rem]">
      <DateInput id={id} value={value.date} onChange={(date) => onChange({ ...value, date })} disabled={disabled} {...aria} />
      <input
        type="text"
        inputMode="numeric"
        aria-label="সময় (ঢাকা, ২৪ ঘণ্টা)"
        placeholder="১৭:০০"
        value={value.time}
        onChange={(e) => onChange({ ...value, time: e.target.value })}
        disabled={disabled}
        aria-invalid={aria["aria-invalid"]}
        className={cn(inputClass, "tabular-nums")}
      />
    </div>
  );
}
