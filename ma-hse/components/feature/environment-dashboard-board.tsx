"use client";

import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Droplets,
  Eye,
  EyeOff,
  Flame,
  Leaf,
  Recycle,
  RotateCcw,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  aggregateEnvironmentMonths,
  summarizeEnvironmentMonths,
  type EnvironmentDashboardPlant,
  type EnvironmentMonthlySnapshot,
  type EnvironmentSummary,
  type EnvironmentWasteBreakdownItem,
} from "@/lib/environment-dashboard";
import { getUiDictionary, type DashboardUiDictionary } from "@/lib/ui-language";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  scopeLabel: string;
  periodLabel: string;
  plants: EnvironmentDashboardPlant[];
  comparisonPlants?: EnvironmentDashboardPlant[];
  isDefaultPeriod?: boolean;
  periodMonthsCount?: number;
  storageKeyBase?: string;
  className?: string;
  labels?: DashboardUiDictionary;
};

type MetricKey = "energyMwh" | "waterM3" | "totalWasteTons" | "spills";
type SnapshotMetricKey =
  | MetricKey
  | "electricityFromGridMwh"
  | "selfProducedEnergyMwh"
  | "heatingM3"
  | "waterNetworkM3"
  | "waterCapturedM3"
  | "compressedAirM3"
  | "compressedAirMwh"
  | "nonHazardousWasteTons"
  | "hazardousWasteTons"
  | "recycledWasteTons"
  | "hoursWorked"
  | "standardHours";
type VisualizationType = "card" | "bar" | "line" | "pie" | "table";
type WidgetId =
  | "trend"
  | "water"
  | "waste"
  | "context"
  | "snapshot"
  | "energy"
  | "coverage"
  | "waterReuse"
  | "resourceLoad";
type WidgetPreference = {
  id: WidgetId;
  visible: boolean;
  view: VisualizationType;
};

const METRIC_COLORS: Record<MetricKey, string> = {
  energyMwh: "#f97316",
  waterM3: "#0ea5e9",
  totalWasteTons: "#22c55e",
  spills: "#e11d48",
};
const VIEW_LABEL_KEYS: Record<VisualizationType, keyof DashboardUiDictionary> = {
  card: "card",
  bar: "bars",
  line: "line",
  pie: "circular",
  table: "table",
};
const DEFAULT_WIDGETS: WidgetPreference[] = [
  { id: "trend", visible: true, view: "bar" },
  { id: "water", visible: true, view: "card" },
  { id: "waste", visible: true, view: "pie" },
  { id: "context", visible: true, view: "card" },
  { id: "snapshot", visible: true, view: "table" },
  { id: "energy", visible: true, view: "card" },
  { id: "coverage", visible: true, view: "card" },
  { id: "waterReuse", visible: true, view: "card" },
  { id: "resourceLoad", visible: true, view: "card" },
];
const WIDGET_TITLE_KEYS: Record<WidgetId, keyof DashboardUiDictionary> = {
  trend: "environmentalPulse",
  water: "waterProfile",
  waste: "wasteByType",
  context: "operationalContext",
  snapshot: "recentMonthlySnapshot",
  energy: "energyProfile",
  coverage: "reportingCoverage",
  waterReuse: "waterReuseSignal",
  resourceLoad: "resourceLoad",
};
const COMPACT_WIDGETS = new Set<WidgetId>(["coverage", "waterReuse", "resourceLoad"]);

function formatTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((label, [key, value]) => label.replace(`{${key}}`, String(value)), template);
}

function getViewLabel(labels: DashboardUiDictionary, view: VisualizationType) {
  return labels[VIEW_LABEL_KEYS[view]];
}

function getWidgetTitle(labels: DashboardUiDictionary, id: WidgetId) {
  return labels[WIDGET_TITLE_KEYS[id]];
}

function localizeWasteItem(item: EnvironmentWasteBreakdownItem, labels: DashboardUiDictionary): EnvironmentWasteBreakdownItem {
  const key = item.key.toLowerCase();
  const normalizedLabel = item.label.toLowerCase();

  if (key === "non-hazardous" || normalizedLabel === "non-hazardous") {
    return { ...item, label: labels.nonHazardous };
  }

  if (key === "hazardous" || normalizedLabel === "hazardous") {
    return { ...item, label: labels.hazardous };
  }

  if (key === "recycled" || normalizedLabel === "recycled") {
    return { ...item, label: labels.recycled };
  }

  return item;
}

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(value);
}

function formatMetric(value: number, unit: string, maximumFractionDigits = 0) {
  if (!unit) return formatNumber(value, maximumFractionDigits);
  return `${formatNumber(value, maximumFractionDigits)} ${unit}`;
}

function percent(value: number, total: number) {
  return total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
}

function latestProgress(months: EnvironmentMonthlySnapshot[], metric: MetricKey) {
  const latest = months.at(-1)?.[metric] ?? 0;
  const peak = Math.max(1, ...months.map((month) => month[metric]));
  return percent(latest, peak);
}

function percentChange(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }

  return ((current - previous) / previous) * 100;
}

function formatVariation(value: number | null) {
  if (value === null) return "n/a";
  if (value === 0) return "0.0%";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function variationTone(value: number | null) {
  if (value === null || value === 0) return "neutral" as const;
  return value > 0 ? ("danger" as const) : ("success" as const);
}

function findPreviousMonth(months: EnvironmentMonthlySnapshot[], month: EnvironmentMonthlySnapshot, metric: MetricKey) {
  return months.find((entry) => entry.year === month.year - 1 && entry.month === month.month)?.[metric] ?? 0;
}

function KpiRailCard({
  title,
  value,
  unit,
  detailLabel,
  detailValue,
  variation,
  variationContext,
  progress,
  accent,
  icon: Icon,
}: {
  title: string;
  value: string;
  unit: string;
  detailLabel: string;
  detailValue?: string;
  variation: number | null;
  variationContext: string;
  progress: number;
  accent: string;
  icon: LucideIcon;
}) {
  const tone = variationTone(variation);
  const variationClassName =
    tone === "danger"
      ? "border-red-300/30 bg-red-500/20 text-red-100"
      : tone === "success"
        ? "border-emerald-300/30 bg-emerald-500/20 text-emerald-100"
        : "border-white/20 bg-white/10 text-white/70";

  return (
    <article className="rounded-xl border border-white/15 bg-white/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-white/70">{title}</p>
          <p className="mt-2 text-4xl font-black leading-none" style={{ color: accent }}>
            {value}
            <span className="ml-1 text-sm font-bold text-white/70">{unit}</span>
          </p>
        </div>
        <Icon className="h-6 w-6 text-white/75" />
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20">
        <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: accent }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-medium text-white/70">
        <span>
          {detailLabel}
          {detailValue ? <span className="font-bold text-white"> {detailValue}</span> : null}
        </span>
        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold", variationClassName)} title={variationContext}>
          {formatVariation(variation)}
        </span>
      </div>
    </article>
  );
}

function Panel({
  title,
  eyebrow,
  children,
  className,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white p-4 shadow-sm", className)}>
      <div>
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{eyebrow}</p> : null}
        <h3 className="text-base font-black text-slate-950">{title}</h3>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function TrendRow({
  label,
  unit,
  color,
  months,
  metric,
  digits = 0,
}: {
  label: string;
  unit: string;
  color: string;
  months: EnvironmentMonthlySnapshot[];
  metric: MetricKey;
  digits?: number;
}) {
  const values = months.map((month) => month[metric]);
  const maxValue = Math.max(1, ...values);
  const total = values.reduce((sum, value) => sum + value, 0);

  return (
    <div className="grid gap-3 sm:grid-cols-[132px_minmax(0,1fr)] sm:items-end">
      <div>
        <p className="text-sm font-bold text-slate-900">{label}</p>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {formatMetric(total, unit, digits)}
        </p>
      </div>
      <div>
        <div className="flex h-16 items-end gap-1.5 rounded-lg bg-slate-50 px-2 py-2">
          {months.map((month) => {
            const value = month[metric];
            const height = Math.max(8, percent(value, maxValue));
            return (
              <div key={`${metric}-${month.key}`} className="flex min-w-0 flex-1 items-end" title={`${month.label}: ${formatMetric(value, unit, digits)}`}>
                <span className="block w-full rounded-t-[4px]" style={{ height: `${height}%`, backgroundColor: color }} />
              </div>
            );
          })}
        </div>
        <div className="mt-1 grid text-[10px] font-medium text-slate-400" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
          {months.map((month, index) => (
            <span key={`${metric}-label-${month.key}`} className="truncate text-center">
              {index === 0 || index === months.length - 1 || months.length <= 6 ? month.label.split(" ")[0] : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TrendPanel({ months, labels }: { months: EnvironmentMonthlySnapshot[]; labels: DashboardUiDictionary }) {
  const visibleMonths = months.slice(-12);

  if (visibleMonths.length === 0) {
    return <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">{labels.noMonthlyInputData}</div>;
  }

  return (
    <div className="space-y-4">
      <TrendRow label={labels.energyConsumption} unit="MWh" color={METRIC_COLORS.energyMwh} months={visibleMonths} metric="energyMwh" digits={1} />
      <TrendRow label={labels.waterUsage} unit="m3" color={METRIC_COLORS.waterM3} months={visibleMonths} metric="waterM3" digits={1} />
      <TrendRow label={labels.waste} unit="t" color={METRIC_COLORS.totalWasteTons} months={visibleMonths} metric="totalWasteTons" digits={2} />
      <TrendRow label={labels.spills} unit="events" color={METRIC_COLORS.spills} months={visibleMonths} metric="spills" />
    </div>
  );
}

function HorizontalBreakdown({
  rows,
  unit,
  digits = 0,
  noDataLabel,
}: {
  rows: Array<{ label: string; value: number; color: string }>;
  unit: string;
  digits?: number;
  noDataLabel: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  if (total <= 0) {
    return <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">{noDataLabel}</div>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-slate-700">{row.label}</span>
            <span className="font-bold text-slate-950">{formatMetric(row.value, unit, digits)}</span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${percent(row.value, total)}%`, backgroundColor: row.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function donutItems(items: EnvironmentWasteBreakdownItem[], labels: DashboardUiDictionary) {
  const visible = items.slice(0, 6);
  const otherValue = items.slice(6).reduce((sum, item) => sum + item.value, 0);

  if (otherValue <= 0) return visible;
  return [...visible, { key: "other", label: labels.other, value: otherValue, color: "#94a3b8" }];
}

function DonutChart({
  items,
  centerLabel = "Waste",
  unit = "t",
  digits = 1,
  noDataLabel = "No data for this period.",
  labels = getUiDictionary("en").dashboard,
}: {
  items: EnvironmentWasteBreakdownItem[];
  centerLabel?: string;
  unit?: string;
  digits?: number;
  noDataLabel?: string;
  labels?: DashboardUiDictionary;
}) {
  const data = donutItems(items, labels);
  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (total <= 0) {
    return <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">{noDataLabel}</div>;
  }

  const segments = data.reduce<{
    offset: number;
    items: Array<{ item: EnvironmentWasteBreakdownItem; slice: number; offset: number }>;
  }>(
    (state, item) => {
      const slice = (item.value / total) * 100;
      return {
        offset: state.offset + slice,
        items: [...state.items, { item, slice, offset: state.offset }],
      };
    },
    { offset: 0, items: [] },
  ).items;

  return (
    <div className="grid gap-4 sm:grid-cols-[164px_minmax(0,1fr)] sm:items-center">
      <svg viewBox="0 0 160 160" className="mx-auto h-40 w-40">
        <circle cx="80" cy="80" r="54" fill="none" stroke="var(--chart-track)" strokeWidth="24" />
        {segments.map(({ item, slice, offset }) => (
          <circle
            key={item.key}
            cx="80"
            cy="80"
            r="54"
            fill="none"
            pathLength="100"
            stroke={item.color}
            strokeDasharray={`${slice} ${100 - slice}`}
            strokeDashoffset={-offset}
            strokeWidth="24"
            transform="rotate(-90 80 80)"
          />
        ))}
        <text x="80" y="76" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--chart-text-muted)">
          {centerLabel}
        </text>
        <text x="80" y="96" textAnchor="middle" fontSize="18" fontWeight="900" fill="var(--chart-text-strong)">
          {formatMetric(total, unit, digits)}
        </text>
      </svg>
      <div className="space-y-2">
        {data.map((item) => (
          <div key={`legend-${item.key}`} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 font-medium text-slate-700">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="truncate">{item.label}</span>
            </span>
            <span className="shrink-0 font-bold text-slate-950">{formatMetric(item.value, unit, digits)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("mt-1 text-xl font-black", tone)}>{value}</p>
    </div>
  );
}

function OperationalContext({ summary, labels }: { summary: EnvironmentSummary; labels: DashboardUiDictionary }) {
  const selfProducedShare = percent(summary.selfProducedEnergyMwh, summary.energyMwh);
  const recycledShare = percent(summary.recycledWasteTons, summary.totalWasteTons);
  const waterPerWorker = summary.averageWorkers > 0 ? summary.waterM3 / summary.averageWorkers : 0;
  const energyPerWorker = summary.averageWorkers > 0 ? summary.energyMwh / summary.averageWorkers : 0;
  const wastePerWorker = summary.averageWorkers > 0 ? summary.totalWasteTons / summary.averageWorkers : 0;
  const energyPerStandardHour = summary.standardHours > 0 ? summary.energyMwh / summary.standardHours : 0;
  const waterPerStandardHour = summary.standardHours > 0 ? summary.waterM3 / summary.standardHours : 0;
  const wastePerStandardHour = summary.standardHours > 0 ? summary.totalWasteTons / summary.standardHours : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <MiniStat label={labels.avgWorkers} value={formatNumber(summary.averageWorkers, 0)} tone="text-slate-950" />
      <MiniStat label={labels.standardHours} value={formatMetric(summary.standardHours, "h", 1)} tone="text-indigo-950" />
      <MiniStat label={labels.selfProducedEnergy} value={`${formatNumber(selfProducedShare, 1)}%`} tone="text-emerald-700" />
      <MiniStat label={labels.recycledWasteShare} value={`${formatNumber(recycledShare, 1)}%`} tone="text-teal-700" />
      <MiniStat label={labels.energyPerWorker} value={formatMetric(energyPerWorker, "MWh", 2)} tone="text-orange-700" />
      <MiniStat label={labels.energyPerStandardHour} value={formatMetric(energyPerStandardHour, "MWh/h", 4)} tone="text-orange-700" />
      <MiniStat label={labels.waterPerWorker} value={formatMetric(waterPerWorker, "m3", 1)} tone="text-sky-700" />
      <MiniStat label={labels.waterPerStandardHour} value={formatMetric(waterPerStandardHour, "m3/h", 2)} tone="text-sky-700" />
      <MiniStat label={labels.wastePerWorker} value={formatMetric(wastePerWorker, "t", 3)} tone="text-emerald-700" />
      <MiniStat label={labels.wastePerStandardHour} value={formatMetric(wastePerStandardHour, "t/h", 5)} tone="text-emerald-700" />
    </div>
  );
}

function PlantComparison({ plants, labels }: { plants: EnvironmentDashboardPlant[]; labels: DashboardUiDictionary }) {
  const summaries = plants
    .map((plant) => ({
      plant,
      summary: summarizeEnvironmentMonths(plant.months),
    }))
    .sort((left, right) => right.summary.energyMwh - left.summary.energyMwh || left.plant.name.localeCompare(right.plant.name))
    .slice(0, 8);
  const maxEnergy = Math.max(1, ...summaries.map((entry) => entry.summary.energyMwh));

  if (summaries.length === 0) {
    return <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">{labels.noPlantDataForThisPeriod}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-2 pr-3">{labels.plant}</th>
            <th className="px-3 py-2">{labels.energyConsumption}</th>
            <th className="px-3 py-2">{labels.waterUsage}</th>
            <th className="px-3 py-2">{labels.waste}</th>
            <th className="px-3 py-2">{labels.spills}</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map(({ plant, summary }) => (
            <tr key={plant.id} className="border-t border-slate-100">
              <td className="py-3 pr-3">
                <p className="font-bold text-slate-900">{plant.name}</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{plant.code}</p>
              </td>
              <td className="px-3 py-3">
                <div className="h-2 w-24 overflow-hidden rounded-full bg-orange-100">
                  <div className="h-full rounded-full bg-orange-500" style={{ width: `${percent(summary.energyMwh, maxEnergy)}%` }} />
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-700">{formatMetric(summary.energyMwh, "MWh", 1)}</p>
              </td>
              <td className="px-3 py-3 font-semibold text-sky-800">{formatMetric(summary.waterM3, "m3", 1)}</td>
              <td className="px-3 py-3 font-semibold text-emerald-800">{formatMetric(summary.totalWasteTons, "t", 2)}</td>
              <td className="px-3 py-3 font-semibold text-rose-800">{formatNumber(summary.spills)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SnapshotTable({ months, labels }: { months: EnvironmentMonthlySnapshot[]; labels: DashboardUiDictionary }) {
  const visibleMonths = months.slice(-6).reverse();

  if (visibleMonths.length === 0) {
    return <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">{labels.noMonthlyRows}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">{labels.period}</th>
            <th className="px-3 py-2">{labels.energyConsumption}</th>
            <th className="px-3 py-2">{labels.waterUsage}</th>
            <th className="px-3 py-2">{labels.waste}</th>
            <th className="px-3 py-2">{labels.spills}</th>
          </tr>
        </thead>
        <tbody>
          {visibleMonths.map((month) => (
            <tr key={month.key} className="border-t border-slate-100">
              <td className="px-3 py-2 font-semibold text-slate-900">{month.label}</td>
              <td className="px-3 py-2 text-orange-700">{formatMetric(month.energyMwh, "MWh", 1)}</td>
              <td className="px-3 py-2 text-sky-700">{formatMetric(month.waterM3, "m3", 1)}</td>
              <td className="px-3 py-2 text-emerald-700">{formatMetric(month.totalWasteTons, "t", 2)}</td>
              <td className="px-3 py-2 text-rose-700">{formatNumber(month.spills)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type MetricSeries = {
  key: string;
  label: string;
  metric: SnapshotMetricKey;
  unit: string;
  digits?: number;
  color: string;
};

function metricValue(month: EnvironmentMonthlySnapshot, metric: SnapshotMetricKey) {
  return month[metric];
}

function NoData({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-sm text-slate-500">{children}</div>;
}

function ChartLegend({ series }: { series: Array<{ key: string; label: string; color: string }> }) {
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {series.map((entry) => (
        <span key={entry.key} className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          {entry.label}
        </span>
      ))}
    </div>
  );
}

function MonthlyBarChart({ months, series, labels }: { months: EnvironmentMonthlySnapshot[]; series: MetricSeries[]; labels: DashboardUiDictionary }) {
  const visibleMonths = months.slice(-12);

  if (visibleMonths.length === 0) {
    return <NoData>{labels.noMonthlyInputData}</NoData>;
  }

  const maxValue = Math.max(1, ...visibleMonths.flatMap((month) => series.map((entry) => metricValue(month, entry.metric))));

  return (
    <div>
      <ChartLegend series={series} />
      <div className="flex h-52 items-end gap-2 overflow-x-auto rounded-lg bg-slate-50 px-3 py-3">
        {visibleMonths.map((month) => (
          <div key={month.key} className="flex min-w-[58px] flex-1 flex-col items-center justify-end gap-2">
            <div className="flex h-40 w-full items-end justify-center gap-1">
              {series.map((entry) => {
                const value = metricValue(month, entry.metric);
                return (
                  <span
                    key={`${month.key}-${entry.key}`}
                    className="w-full max-w-5 rounded-t-[4px]"
                    style={{ height: `${Math.max(6, percent(value, maxValue))}%`, backgroundColor: entry.color }}
                    title={`${month.label}: ${formatMetric(value, entry.unit, entry.digits ?? 0)}`}
                  />
                );
              })}
            </div>
            <span className="max-w-[58px] truncate text-center text-[10px] font-medium text-slate-400">{month.label.split(" ")[0]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthlyLineChart({ months, series, labels }: { months: EnvironmentMonthlySnapshot[]; series: MetricSeries[]; labels: DashboardUiDictionary }) {
  const visibleMonths = months.slice(-12);

  if (visibleMonths.length === 0) {
    return <NoData>{labels.noMonthlyInputData}</NoData>;
  }

  const width = 720;
  const height = 260;
  const maxValue = Math.max(1, ...visibleMonths.flatMap((month) => series.map((entry) => metricValue(month, entry.metric))));
  const chartWidth = 640;
  const stepX = visibleMonths.length > 1 ? chartWidth / (visibleMonths.length - 1) : chartWidth;

  return (
    <div className="overflow-x-auto">
      <ChartLegend series={series} />
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[720px]">
        <line x1="48" y1="212" x2="688" y2="212" stroke="var(--chart-axis)" />
        {series.map((entry) => {
          const points = visibleMonths
            .map((month, index) => {
              const x = 48 + index * stepX;
              const y = 212 - percent(metricValue(month, entry.metric), maxValue) * 1.72;
              return `${x},${y}`;
            })
            .join(" ");

          return (
            <g key={entry.key}>
              <polyline points={points} fill="none" stroke={entry.color} strokeWidth="3" />
              {visibleMonths.map((month, index) => {
                const x = 48 + index * stepX;
                const y = 212 - percent(metricValue(month, entry.metric), maxValue) * 1.72;
                return (
                  <circle
                    key={`${entry.key}-${month.key}`}
                    cx={x}
                    cy={y}
                    r="4.5"
                    fill={entry.color}
                  >
                    <title>{`${month.label}: ${formatMetric(metricValue(month, entry.metric), entry.unit, entry.digits ?? 0)}`}</title>
                  </circle>
                );
              })}
            </g>
          );
        })}
        {visibleMonths.map((month, index) => (
          <text key={month.key} x={48 + index * stepX} y="235" textAnchor="middle" fontSize="11" fill="var(--chart-text-muted)">
            {month.label.split(" ")[0]}
          </text>
        ))}
        <text x="48" y="26" fontSize="12" fill="var(--chart-text-muted)">
          {labels.max}: {formatNumber(maxValue, 1)}
        </text>
      </svg>
    </div>
  );
}

function MonthlyMetricTable({
  months,
  series,
  labels,
  limit = 12,
}: {
  months: EnvironmentMonthlySnapshot[];
  series: MetricSeries[];
  labels: DashboardUiDictionary;
  limit?: number;
}) {
  const visibleMonths = months.slice(-limit).reverse();

  if (visibleMonths.length === 0) {
    return <NoData>{labels.noMonthlyRows}</NoData>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">{labels.period}</th>
            {series.map((entry) => (
              <th key={entry.key} className="px-3 py-2">{entry.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleMonths.map((month) => (
            <tr key={month.key} className="border-t border-slate-100">
              <td className="px-3 py-2 font-semibold text-slate-900">{month.label}</td>
              {series.map((entry) => (
                <td key={`${month.key}-${entry.key}`} className="px-3 py-2 font-semibold text-slate-700">
                  {formatMetric(metricValue(month, entry.metric), entry.unit, entry.digits ?? 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BreakdownTable({
  rows,
  unit,
  labels,
  digits = 0,
}: {
  rows: Array<{ label: string; value: number }>;
  unit: string;
  labels: DashboardUiDictionary;
  digits?: number;
}) {
  const visibleRows = rows.filter((row) => row.value > 0);

  if (visibleRows.length === 0) {
    return <NoData>{labels.noDataForThisPeriod}</NoData>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">{labels.indicator}</th>
            <th className="px-3 py-2">{labels.value}</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row.label} className="border-t border-slate-100">
              <td className="px-3 py-2 font-semibold text-slate-900">{row.label}</td>
              <td className="px-3 py-2 text-slate-700">{formatMetric(row.value, unit, digits)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function breakdownToItems(rows: Array<{ label: string; value: number; color: string }>): EnvironmentWasteBreakdownItem[] {
  return rows.map((row) => ({
    key: row.label,
    label: row.label,
    value: row.value,
    color: row.color,
  }));
}

function waterBreakdown(summary: EnvironmentSummary, labels: DashboardUiDictionary) {
  return [
    { label: labels.networkWater, value: summary.waterNetworkM3, color: "#0ea5e9" },
    { label: labels.capturedWater, value: summary.waterCapturedM3, color: "#14b8a6" },
  ];
}

function energyBreakdown(summary: EnvironmentSummary, labels: DashboardUiDictionary) {
  return [
    { label: labels.gridElectricity, value: summary.electricityFromGridMwh, color: "#f97316" },
    { label: labels.selfProducedElectricity, value: summary.selfProducedEnergyMwh, color: "#22c55e" },
    { label: labels.compressedAir, value: summary.compressedAirMwh, color: "#8b5cf6" },
  ];
}

function metricSeries(metric: SnapshotMetricKey, label: string, unit: string, color: string, digits = 0): MetricSeries {
  return { key: metric, label, metric, unit, color, digits };
}

function trendSeries(labels: DashboardUiDictionary) {
  return [
    metricSeries("energyMwh", labels.energyConsumption, "MWh", METRIC_COLORS.energyMwh, 1),
    metricSeries("waterM3", labels.waterUsage, "m3", METRIC_COLORS.waterM3, 1),
    metricSeries("totalWasteTons", labels.waste, "t", METRIC_COLORS.totalWasteTons, 2),
    metricSeries("spills", labels.spills, "events", METRIC_COLORS.spills, 0),
  ];
}

function SummaryCards({ summary, labels }: { summary: EnvironmentSummary; labels: DashboardUiDictionary }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <MiniStat label={labels.energyConsumption} value={formatMetric(summary.energyMwh, "MWh", 1)} tone="text-orange-700" />
      <MiniStat label={labels.waterUsage} value={formatMetric(summary.waterM3, "m3", 1)} tone="text-sky-700" />
      <MiniStat label={labels.waste} value={formatMetric(summary.totalWasteTons, "t", 2)} tone="text-emerald-700" />
      <MiniStat label={labels.spills} value={formatNumber(summary.spills)} tone="text-rose-700" />
    </div>
  );
}

function PlantComparisonCards({ plants, labels }: { plants: EnvironmentDashboardPlant[]; labels: DashboardUiDictionary }) {
  const summaries = plants
    .map((plant) => ({ plant, summary: summarizeEnvironmentMonths(plant.months) }))
    .sort((left, right) => right.summary.energyMwh - left.summary.energyMwh || left.plant.name.localeCompare(right.plant.name))
    .slice(0, 4);

  if (summaries.length === 0) {
    return <NoData>{labels.noPlantDataForThisPeriod}</NoData>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {summaries.map(({ plant, summary }) => (
        <div key={plant.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{plant.code}</p>
          <p className="mt-1 text-sm font-black text-slate-950">{plant.name}</p>
          <p className="mt-2 text-xs font-semibold text-orange-700">{formatMetric(summary.energyMwh, "MWh", 1)}</p>
        </div>
      ))}
    </div>
  );
}

function renderWidgetContent(input: {
  preference: WidgetPreference;
  months: EnvironmentMonthlySnapshot[];
  summary: EnvironmentSummary;
  plants: EnvironmentDashboardPlant[];
  labels: DashboardUiDictionary;
}) {
  const { preference, months, summary, plants, labels } = input;
  const localizedWasteBreakdown = summary.wasteBreakdown.map((item) => localizeWasteItem(item, labels));

  if (preference.id === "trend") {
    if (preference.view === "card") return <SummaryCards summary={summary} labels={labels} />;
    if (preference.view === "line") return <MonthlyLineChart months={months} series={trendSeries(labels)} labels={labels} />;
    if (preference.view === "pie") {
      return (
        <DonutChart
          centerLabel={labels.total}
          unit=""
          digits={1}
          labels={labels}
          noDataLabel={labels.noDataForThisPeriod}
          items={[
            { key: "energy", label: labels.energyConsumption, value: summary.energyMwh, color: METRIC_COLORS.energyMwh },
            { key: "water", label: labels.waterUsage, value: summary.waterM3, color: METRIC_COLORS.waterM3 },
            { key: "waste", label: labels.waste, value: summary.totalWasteTons, color: METRIC_COLORS.totalWasteTons },
            { key: "spills", label: labels.spills, value: summary.spills, color: METRIC_COLORS.spills },
          ]}
        />
      );
    }
    if (preference.view === "table") return <MonthlyMetricTable months={months} series={trendSeries(labels)} labels={labels} />;
    return <TrendPanel months={months} labels={labels} />;
  }

  if (preference.id === "water") {
    const rows = waterBreakdown(summary, labels);
    const series = [
      metricSeries("waterNetworkM3", labels.networkWater, "m3", "#0ea5e9", 1),
      metricSeries("waterCapturedM3", labels.capturedWater, "m3", "#14b8a6", 1),
    ];
    if (preference.view === "bar") return <MonthlyBarChart months={months} series={series} labels={labels} />;
    if (preference.view === "line") return <MonthlyLineChart months={months} series={series} labels={labels} />;
    if (preference.view === "pie") return <DonutChart items={breakdownToItems(rows)} centerLabel={labels.waterUsage} unit="m3" digits={1} labels={labels} noDataLabel={labels.noDataForThisPeriod} />;
    if (preference.view === "table") return <BreakdownTable rows={rows} unit="m3" digits={1} labels={labels} />;
    return <HorizontalBreakdown unit="m3" digits={1} rows={rows} noDataLabel={labels.noDataForThisPeriod} />;
  }

  if (preference.id === "waste") {
    const series = [
      metricSeries("nonHazardousWasteTons", labels.nonHazardous, "t", "#84cc16", 2),
      metricSeries("hazardousWasteTons", labels.hazardous, "t", "#be123c", 2),
      metricSeries("recycledWasteTons", labels.recycled, "t", "#10b981", 2),
    ];
    if (preference.view === "bar") return <MonthlyBarChart months={months} series={series} labels={labels} />;
    if (preference.view === "line") return <MonthlyLineChart months={months} series={series} labels={labels} />;
    if (preference.view === "table") return <BreakdownTable rows={localizedWasteBreakdown} unit="t" digits={2} labels={labels} />;
    if (preference.view === "card") {
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <MiniStat label={labels.nonHazardous} value={formatMetric(summary.nonHazardousWasteTons, "t", 2)} tone="text-lime-700" />
          <MiniStat label={labels.hazardous} value={formatMetric(summary.hazardousWasteTons, "t", 2)} tone="text-rose-700" />
          <MiniStat label={labels.recycled} value={formatMetric(summary.recycledWasteTons, "t", 2)} tone="text-emerald-700" />
        </div>
      );
    }
    return <DonutChart items={localizedWasteBreakdown} centerLabel={labels.waste} labels={labels} noDataLabel={labels.noDataForThisPeriod} />;
  }

  if (preference.id === "context") {
    if (preference.view === "table") {
      return plants.length > 1 ? <PlantComparison plants={plants} labels={labels} /> : <OperationalContext summary={summary} labels={labels} />;
    }
    if (preference.view === "card") {
      return plants.length > 1 ? <PlantComparisonCards plants={plants} labels={labels} /> : <OperationalContext summary={summary} labels={labels} />;
    }
    return plants.length > 1 ? (
      <MonthlyBarChart
        months={months}
        labels={labels}
        series={[
          metricSeries("energyMwh", labels.energyConsumption, "MWh", METRIC_COLORS.energyMwh, 1),
          metricSeries("waterM3", labels.waterUsage, "m3", METRIC_COLORS.waterM3, 1),
        ]}
      />
    ) : (
      <OperationalContext summary={summary} labels={labels} />
    );
  }

  if (preference.id === "snapshot") {
    if (preference.view === "card") return <SummaryCards summary={summary} labels={labels} />;
    if (preference.view === "bar") return <MonthlyBarChart months={months} series={trendSeries(labels)} labels={labels} />;
    if (preference.view === "line") return <MonthlyLineChart months={months} series={trendSeries(labels)} labels={labels} />;
    if (preference.view === "pie") {
      return <DonutChart items={breakdownToItems(waterBreakdown(summary, labels))} centerLabel={labels.waterUsage} unit="m3" digits={1} labels={labels} noDataLabel={labels.noDataForThisPeriod} />;
    }
    return <SnapshotTable months={months} labels={labels} />;
  }

  if (preference.id === "energy") {
    const rows = energyBreakdown(summary, labels);
    const series = [
      metricSeries("electricityFromGridMwh", labels.grid, "MWh", "#f97316", 1),
      metricSeries("selfProducedEnergyMwh", labels.selfProduced, "MWh", "#22c55e", 1),
      metricSeries("compressedAirMwh", labels.compressedAir, "MWh", "#8b5cf6", 1),
    ];
    if (preference.view === "bar") return <MonthlyBarChart months={months} series={series} labels={labels} />;
    if (preference.view === "line") return <MonthlyLineChart months={months} series={series} labels={labels} />;
    if (preference.view === "pie") return <DonutChart items={breakdownToItems(rows)} centerLabel={labels.energyConsumption} unit="MWh" digits={1} labels={labels} noDataLabel={labels.noDataForThisPeriod} />;
    if (preference.view === "table") return <BreakdownTable rows={rows} unit="MWh" digits={1} labels={labels} />;
    return (
      <>
        <HorizontalBreakdown unit="MWh" digits={1} rows={rows} noDataLabel={labels.noDataForThisPeriod} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <MiniStat label={labels.heating} value={formatMetric(summary.heatingM3, "m3", 1)} tone="text-orange-800" />
          <MiniStat label={labels.compressedAir} value={formatMetric(summary.compressedAirM3, "m3", 1)} tone="text-violet-800" />
        </div>
      </>
    );
  }

  if (preference.id === "coverage") {
    const series = [metricSeries("standardHours", labels.standardHours, "h", "#22c55e", 1)];
    if (preference.view === "bar") return <MonthlyBarChart months={months} series={series} labels={labels} />;
    if (preference.view === "line") return <MonthlyLineChart months={months} series={series} labels={labels} />;
    if (preference.view === "table") return <MonthlyMetricTable months={months} series={series} labels={labels} />;
    return <MiniStat label={labels.monthsWithInputs} value={formatNumber(summary.monthsCount)} tone="text-emerald-950" />;
  }

  if (preference.id === "waterReuse") {
    const series = [metricSeries("waterCapturedM3", labels.capturedWater, "m3", "#0ea5e9", 1)];
    if (preference.view === "bar") return <MonthlyBarChart months={months} series={series} labels={labels} />;
    if (preference.view === "line") return <MonthlyLineChart months={months} series={series} labels={labels} />;
    if (preference.view === "table") return <MonthlyMetricTable months={months} series={series} labels={labels} />;
    return <MiniStat label={labels.capturedWater} value={formatMetric(summary.waterCapturedM3, "m3", 1)} tone="text-sky-950" />;
  }

  const series = [metricSeries("hoursWorked", labels.hoursWorked, "h", "#f97316", 1)];
  if (preference.view === "bar") return <MonthlyBarChart months={months} series={series} labels={labels} />;
  if (preference.view === "line") return <MonthlyLineChart months={months} series={series} labels={labels} />;
  if (preference.view === "table") return <MonthlyMetricTable months={months} series={series} labels={labels} />;
  return <MiniStat label={labels.hoursWorked} value={formatMetric(summary.hoursWorked, "h", 1)} tone="text-orange-950" />;
}

function sanitizePreferences(value: unknown): WidgetPreference[] {
  if (!Array.isArray(value)) return DEFAULT_WIDGETS;

  const defaultsById = new Map(DEFAULT_WIDGETS.map((entry) => [entry.id, entry]));
  const parsed = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const id = (entry as Partial<WidgetPreference>).id;
      const view = (entry as Partial<WidgetPreference>).view;
      const defaultPreference = id ? defaultsById.get(id) : undefined;
      if (!defaultPreference) return null;

      return {
        id: defaultPreference.id,
        visible: typeof (entry as Partial<WidgetPreference>).visible === "boolean" ? Boolean((entry as Partial<WidgetPreference>).visible) : defaultPreference.visible,
        view: view && view in VIEW_LABEL_KEYS ? view : defaultPreference.view,
      } satisfies WidgetPreference;
    })
    .filter((entry): entry is WidgetPreference => entry !== null);
  const existingIds = new Set(parsed.map((entry) => entry.id));
  const missing = DEFAULT_WIDGETS.filter((entry) => !existingIds.has(entry.id));

  return [...parsed, ...missing];
}

function DashboardCustomizer({
  preferences,
  onChange,
  onReset,
  labels,
}: {
  preferences: WidgetPreference[];
  onChange: (preferences: WidgetPreference[]) => void;
  onReset: () => void;
  labels: DashboardUiDictionary;
}) {
  const [open, setOpen] = useState(false);

  const updatePreference = (id: WidgetId, patch: Partial<WidgetPreference>) => {
    onChange(preferences.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  };
  const movePreference = (id: WidgetId, direction: -1 | 1) => {
    const index = preferences.findIndex((entry) => entry.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= preferences.length) return;
    const next = [...preferences];
    const [entry] = next.splice(index, 1);
    next.splice(nextIndex, 0, entry);
    onChange(next);
  };

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          onClick={() => setOpen((current) => !current)}
        >
          <Settings2 className="h-4 w-4" />
          {labels.customize}
        </button>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          onClick={onReset}
        >
          <RotateCcw className="h-4 w-4" />
          {labels.reset}
        </button>
      </div>

      {open ? (
        <div className="mt-3 grid gap-2">
          {preferences.map((preference, index) => (
            <div key={preference.id} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 md:grid-cols-[minmax(0,1fr)_150px_auto] md:items-center">
              <button
                type="button"
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-[10px] border px-3 text-left text-sm font-semibold transition",
                  preference.visible
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-slate-300 bg-white text-slate-500",
                )}
                onClick={() => updatePreference(preference.id, { visible: !preference.visible })}
              >
                {preference.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                {getWidgetTitle(labels, preference.id)}
              </button>
              <select
                value={preference.view}
                onChange={(event) => updatePreference(preference.id, { view: event.target.value as VisualizationType })}
                className="h-10 rounded-[10px] border border-slate-300 bg-white px-3 text-sm text-slate-900"
              >
                {(Object.keys(VIEW_LABEL_KEYS) as VisualizationType[]).map((view) => (
                  <option key={view} value={view}>{getViewLabel(labels, view)}</option>
                ))}
              </select>
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  title={labels.moveUp}
                  aria-label={labels.moveUp}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-300 bg-white text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={index === 0}
                  onClick={() => movePreference(preference.id, -1)}
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title={labels.moveDown}
                  aria-label={labels.moveDown}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-300 bg-white text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={index === preferences.length - 1}
                  onClick={() => movePreference(preference.id, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function widgetEyebrow(preference: WidgetPreference, plants: EnvironmentDashboardPlant[], labels: DashboardUiDictionary) {
  if (preference.id === "trend") return labels.monthlyTrend;
  if (preference.id === "water" || preference.id === "energy") return preference.view === "card" ? labels.consumptionSplit : getViewLabel(labels, preference.view);
  if (preference.id === "waste") return preference.view === "pie" ? labels.distribution : getViewLabel(labels, preference.view);
  if (preference.id === "context") return plants.length > 1 ? labels.groupView : labels.intensity;
  if (preference.id === "snapshot") return labels.lastInputs;
  if (preference.id === "coverage") return labels.inputs;
  if (preference.id === "waterReuse") return labels.capturedWater;
  return labels.operationalHours;
}

function EnvironmentDashboardWidgets({
  months,
  summary,
  plants,
  storageKeyBase,
  labels,
}: {
  months: EnvironmentMonthlySnapshot[];
  summary: EnvironmentSummary;
  plants: EnvironmentDashboardPlant[];
  storageKeyBase: string;
  labels: DashboardUiDictionary;
}) {
  const storageKey = `${storageKeyBase}-layout`;
  const [preferences, setPreferences] = useState<WidgetPreference[]>(DEFAULT_WIDGETS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      setPreferences(stored ? sanitizePreferences(JSON.parse(stored)) : DEFAULT_WIDGETS);
    } catch {
      window.localStorage.removeItem(storageKey);
      setPreferences(DEFAULT_WIDGETS);
    } finally {
      setLoaded(true);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(storageKey, JSON.stringify(preferences));
  }, [loaded, preferences, storageKey]);

  const visiblePreferences = useMemo(() => preferences.filter((preference) => preference.visible), [preferences]);
  const mainWidgets = visiblePreferences.filter((preference) => !COMPACT_WIDGETS.has(preference.id));
  const compactWidgets = visiblePreferences.filter((preference) => COMPACT_WIDGETS.has(preference.id));

  return (
    <>
      <DashboardCustomizer preferences={preferences} onChange={setPreferences} onReset={() => setPreferences(DEFAULT_WIDGETS)} labels={labels} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        {mainWidgets.map((preference) => (
          <Panel
            key={preference.id}
            title={preference.id === "context" && plants.length > 1 ? labels.plantComparison : getWidgetTitle(labels, preference.id)}
            eyebrow={widgetEyebrow(preference, plants, labels)}
            className={preference.id === "trend" ? "xl:row-span-2" : undefined}
          >
            {renderWidgetContent({ preference, months, summary, plants, labels })}
          </Panel>
        ))}
      </div>

      {compactWidgets.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {compactWidgets.map((preference) => (
            <Panel key={preference.id} title={getWidgetTitle(labels, preference.id)} eyebrow={widgetEyebrow(preference, plants, labels)}>
              {renderWidgetContent({ preference, months, summary, plants, labels })}
            </Panel>
          ))}
        </div>
      ) : null}
    </>
  );
}

function buildRailState(input: {
  metric: MetricKey;
  unit: string;
  digits: number;
  months: EnvironmentMonthlySnapshot[];
  summary: EnvironmentSummary;
  comparisonMonths: EnvironmentMonthlySnapshot[];
  comparisonSummary: EnvironmentSummary;
  isDefaultPeriod: boolean;
  periodMonthsCount: number;
  labels: DashboardUiDictionary;
}) {
  const { metric, unit, digits, months, summary, comparisonMonths, comparisonSummary, isDefaultPeriod, periodMonthsCount, labels } = input;
  const latest = months.at(-1);
  const primaryValue = summary[metric];

  if (isDefaultPeriod) {
    const latestValue = latest?.[metric] ?? 0;
    const previousValue = latest ? findPreviousMonth(comparisonMonths, latest, metric) : 0;
    return {
      value: formatNumber(primaryValue, digits),
      detailLabel: latest ? formatTemplate(labels.latestMonth, { month: latest.label }) : labels.noMonthlyData,
      detailValue: latest ? formatMetric(latestValue, unit, digits) : undefined,
      variation: latest ? percentChange(latestValue, previousValue) : null,
      variationContext: latest ? formatTemplate(labels.comparedWithMonthYear, { month: latest.month, year: latest.year - 1 }) : labels.noPreviousYearData,
    };
  }

  const previousValue = comparisonSummary[metric];
  const singleMonth = periodMonthsCount === 1;

  return {
    value: formatNumber(primaryValue, digits),
    detailLabel: singleMonth ? labels.previousYearSameMonth : labels.previousYearSamePeriod,
    detailValue: formatMetric(previousValue, unit, digits),
    variation: percentChange(primaryValue, previousValue),
    variationContext: singleMonth ? labels.comparedWithSameMonthLastYear : labels.comparedWithSamePeriodLastYear,
  };
}

export function EnvironmentDashboardBoard({
  title,
  scopeLabel,
  periodLabel,
  plants,
  comparisonPlants = [],
  isDefaultPeriod = false,
  periodMonthsCount = 12,
  storageKeyBase = "ma-hse-environment-dashboard",
  className,
  labels = getUiDictionary("en").dashboard,
}: Props) {
  const months = aggregateEnvironmentMonths(plants);
  const summary = summarizeEnvironmentMonths(months);
  const comparisonMonths = aggregateEnvironmentMonths(comparisonPlants);
  const comparisonSummary = summarizeEnvironmentMonths(comparisonMonths);
  const railCards = [
    {
      title: labels.energyConsumption,
      unit: "MWh",
      metric: "energyMwh" as const,
      digits: 1,
      icon: Flame,
      accent: METRIC_COLORS.energyMwh,
    },
    {
      title: labels.waterUsage,
      unit: "m3",
      metric: "waterM3" as const,
      digits: 1,
      icon: Droplets,
      accent: METRIC_COLORS.waterM3,
    },
    {
      title: labels.waste,
      unit: "t",
      metric: "totalWasteTons" as const,
      digits: 2,
      icon: Recycle,
      accent: METRIC_COLORS.totalWasteTons,
    },
    {
      title: labels.spills,
      unit: "events",
      metric: "spills" as const,
      digits: 0,
      icon: AlertTriangle,
      accent: METRIC_COLORS.spills,
    },
  ].map((card) => ({
    ...card,
    state: buildRailState({
      metric: card.metric,
      unit: card.unit,
      digits: card.digits,
      months,
      summary,
      comparisonMonths,
      comparisonSummary,
      isDefaultPeriod,
      periodMonthsCount,
      labels,
    }),
  }));

  return (
    <section className={cn("overflow-hidden rounded-2xl border border-emerald-100 bg-slate-950 shadow-[0_24px_60px_rgba(15,23,42,0.16)]", className)}>
      <div className="grid lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="bg-[radial-gradient(circle_at_18%_12%,rgba(34,197,94,0.32),transparent_30%),radial-gradient(circle_at_92%_16%,rgba(14,165,233,0.28),transparent_26%),linear-gradient(160deg,#14532d_0%,#0f172a_54%,#422006_100%)] p-5 text-white sm:p-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-50">
            <Leaf className="h-4 w-4" />
            {labels.environmentKpis}
          </div>
          <h2 className="mt-4 text-3xl font-black leading-tight text-white">{title}</h2>
          <p className="mt-2 text-sm font-medium text-white/70">{scopeLabel}</p>
          <p className="text-xs font-semibold uppercase tracking-wide text-white/60">{periodLabel}</p>

          <div className="mt-6 space-y-3">
            {railCards.map((card) => (
              <KpiRailCard
                key={card.metric}
                title={card.title}
                value={card.state.value}
                unit={card.unit}
                detailLabel={card.state.detailLabel}
                detailValue={card.state.detailValue}
                variation={card.state.variation}
                variationContext={card.state.variationContext}
                progress={latestProgress(months, card.metric)}
                accent={card.accent}
                icon={card.icon}
              />
            ))}
          </div>
        </aside>

        <div className="bg-slate-50 p-4 sm:p-5">
          <EnvironmentDashboardWidgets
            months={months}
            summary={summary}
            plants={plants}
            storageKeyBase={storageKeyBase}
            labels={labels}
          />
        </div>
      </div>
    </section>
  );
}
