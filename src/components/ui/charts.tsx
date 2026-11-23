"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumberBn, toBnDigits } from "@/domain/bn";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Chart palette (validated with the dataviz validator, light surface):
 * categorical slots 1–3 pass all-pairs CVD and normal-vision checks.
 * Single-series charts use the brand teal only.
 */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a"] as const;
export const SINGLE = "#0f766e";
const AXIS = "#475569";
const GRID = "#e2e8f0";

const tickStyle = { fill: AXIS, fontSize: 13 };
const fmt = (v: unknown) => (typeof v === "number" ? formatNumberBn(v) : String(v));

type Datum = Record<string, string | number>;

/** Visually hidden table so screen-reader users get the numbers (spec §2.5). */
function DataTable({ caption, data, xKey, series }: { caption: string; data: Datum[]; xKey: string; series: { key: string; label: string }[] }) {
  return (
    <table className="sr-only">
      <caption>
        {caption} — {t("common.chartData")}
      </caption>
      <thead>
        <tr>
          <th scope="col">{xKey === "label" ? "" : xKey}</th>
          {series.map((s) => (
            <th key={s.key} scope="col">
              {s.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((d, i) => (
          <tr key={i}>
            <th scope="row">{String(d[xKey])}</th>
            {series.map((s) => (
              <td key={s.key}>{fmt(d[s.key])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-surface px-3 py-2 text-sm shadow-raised">
      {label && <p className="mb-1 font-semibold text-ink">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-ink">
          <span className="size-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-semibold tabular-nums">{fmt(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export function ChartCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border bg-surface p-4 shadow-card", className)}>
      <h2 className="mb-3 text-base font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

/** Horizontal bars, one series. Labels on the axis, so no legend needed. */
export function BarListChart({ title, data }: { title: string; data: { labelBn: string; count: number }[] }) {
  const rows = data.map((d) => ({ label: d.labelBn, value: d.count }));
  return (
    <ChartCard title={title}>
      <div aria-hidden style={{ height: Math.max(160, rows.length * 36) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 24, top: 0, bottom: 0 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" tick={tickStyle} tickFormatter={fmt} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="label" tick={tickStyle} width={130} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
            <Bar dataKey="value" name={title} fill={SINGLE} radius={[0, 4, 4, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable caption={title} data={rows} xKey="label" series={[{ key: "value", label: t("admin.overview.count") }]} />
    </ChartCard>
  );
}

/** Stacked vertical bars over time with up to three series. */
export function StackedBarChart({
  title,
  data,
  xKey,
  series,
}: {
  title: string;
  data: Datum[];
  xKey: string;
  series: { key: string; label: string }[];
}) {
  return (
    <ChartCard title={title}>
      <div aria-hidden className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey={xKey} tick={tickStyle} axisLine={false} tickLine={false} />
            <YAxis tick={tickStyle} tickFormatter={fmt} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
            <Legend wrapperStyle={{ fontSize: 13, color: AXIS }} iconType="square" />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="a"
                fill={SERIES[i]}
                stroke="#ffffff"
                strokeWidth={1}
                radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
                maxBarSize={36}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable caption={title} data={data} xKey={xKey} series={series} />
    </ChartCard>
  );
}

/** Single line over time. */
export function LineTrendChart({ title, data, xKey, yKey, yLabel }: { title: string; data: Datum[]; xKey: string; yKey: string; yLabel: string }) {
  return (
    <ChartCard title={title}>
      <div aria-hidden className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: -16, right: 12, top: 8 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey={xKey} tick={tickStyle} axisLine={false} tickLine={false} />
            <YAxis tick={tickStyle} tickFormatter={fmt} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: AXIS, strokeDasharray: "3 3" }} />
            <Line type="monotone" dataKey={yKey} name={yLabel} stroke={SINGLE} strokeWidth={2} dot={{ r: 4, fill: SINGLE, stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTable caption={title} data={data} xKey={xKey} series={[{ key: yKey, label: yLabel }]} />
    </ChartCard>
  );
}

/** Donut for 2–3 parts of a whole, with a legend that carries labels and values. */
export function DonutChart({ title, data }: { title: string; data: { labelBn: string; count: number }[] }) {
  const total = data.reduce((n, d) => n + d.count, 0);
  const rows = data.map((d) => ({ label: d.labelBn, value: d.count }));
  return (
    <ChartCard title={title}>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <div aria-hidden className="relative size-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={rows} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="100%" stroke="#ffffff" strokeWidth={2} startAngle={90} endAngle={-270}>
                {rows.map((_, i) => (
                  <Cell key={i} fill={SERIES[i % SERIES.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 grid place-items-center text-center">
            <span className="text-xl font-bold text-ink tabular-nums">{formatNumberBn(total)}</span>
          </div>
        </div>
        <ul className="w-full space-y-2" aria-hidden>
          {rows.map((r, i) => (
            <li key={r.label} className="flex items-center gap-2">
              <span className="size-3 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} />
              <span className="text-ink">{r.label}</span>
              <span className="ml-auto font-semibold tabular-nums">
                {formatNumberBn(r.value)} ({toBnDigits(total ? Math.round((r.value / total) * 100) : 0)}%)
              </span>
            </li>
          ))}
        </ul>
      </div>
      <DataTable caption={title} data={rows} xKey="label" series={[{ key: "value", label: t("admin.overview.count") }]} />
    </ChartCard>
  );
}
