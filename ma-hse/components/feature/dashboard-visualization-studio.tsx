"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type PlantSummary,
  type RankingGroup,
  type RankingSeriesSnapshot,
  type MonthlyMetricSnapshot,
} from "@/lib/dashboard-visualization";
import { getUiDictionary, type DashboardUiDictionary } from "@/lib/ui-language";
import { AppCard, AppSectionHeader } from "@/components/ui/app-surface";
import { HelpPopover } from "@/components/ui/help-popover";

type MetricId =
  | "validatedEvents"
  | "openActions"
  | "closedActions"
  | "actionsToClose"
  | "closedActionsPercent"
  | "actionsToClosePercent"
  | "nearMisses"
  | "injuries"
  | "rootCauses"
  | "frequencyRate"
  | "gravityRate";

type ChartType = "bar" | "circular" | "points" | "pareto";

type Props = {
  plants: PlantSummary[];
  rankings: RankingGroup[];
  rankingMonthlySeries: Record<string, RankingSeriesSnapshot[]>;
  activePlantCode: string | null;
  storageKeyBase: string;
  rootCauseMetricLabel?: string;
  labels?: DashboardUiDictionary;
};

type DistributionDatum = {
  key: string;
  label: string;
  value: number;
};

type TrendSeries = {
  key: string;
  label: string;
  values: number[];
};

const COLORS = [
  "var(--chart-series-1)",
  "var(--chart-series-2)",
  "var(--chart-series-3)",
  "var(--chart-series-4)",
  "var(--chart-series-5)",
  "var(--chart-series-6)",
];

const METRIC_OPTIONS: Array<{ id: MetricId; labelKey: keyof DashboardUiDictionary; variant: "count" | "percent" | "index" }> = [
  { id: "validatedEvents", labelKey: "validatedEvents", variant: "count" },
  { id: "openActions", labelKey: "openActions", variant: "count" },
  { id: "closedActions", labelKey: "closedActions", variant: "count" },
  { id: "actionsToClose", labelKey: "actionsToClose", variant: "count" },
  { id: "closedActionsPercent", labelKey: "closedActionsPercent", variant: "percent" },
  { id: "actionsToClosePercent", labelKey: "actionsToClosePercent", variant: "percent" },
  { id: "nearMisses", labelKey: "nearMisses", variant: "count" },
  { id: "injuries", labelKey: "injuries", variant: "count" },
  { id: "rootCauses", labelKey: "sewoRootCauses", variant: "count" },
  { id: "frequencyRate", labelKey: "frequencyRate", variant: "index" },
  { id: "gravityRate", labelKey: "gravityRate", variant: "index" },
];

function getDefaultChartType(trendChartsEnabled: boolean): ChartType {
  return trendChartsEnabled ? "bar" : "pareto";
}

export function resolveStoredChartType(stored: string | null, trendChartsEnabled: boolean): ChartType {
  if (stored === "bar" || stored === "points") {
    return trendChartsEnabled ? stored : "pareto";
  }

  if (stored === "circular" || stored === "pareto") {
    return stored;
  }

  return getDefaultChartType(trendChartsEnabled);
}

function formatValue(value: number, variant: "count" | "percent" | "index") {
  if (variant === "percent") return `${value.toFixed(1)}%`;
  if (variant === "index") return value.toFixed(2);
  return value.toLocaleString();
}

function metricValue(snapshot: MonthlyMetricSnapshot, metricId: MetricId) {
  if (metricId === "nearMisses") return snapshot.nearMisses;
  if (metricId === "injuries") return snapshot.injuries;
  if (metricId === "rootCauses") return snapshot.rootCauses;
  if (metricId === "frequencyRate") return snapshot.frequencyRate;
  if (metricId === "gravityRate") return snapshot.gravityRate;
  return snapshot[metricId];
}

function sumMetric(snapshots: MonthlyMetricSnapshot[], metricId: MetricId) {
  return snapshots.reduce((sum, snapshot) => sum + metricValue(snapshot, metricId), 0);
}

function getMonthAxis(plants: PlantSummary[]) {
  const months = new Map<string, string>();
  for (const plant of plants) {
    for (const snapshot of plant.monthlyMetrics) {
      months.set(snapshot.monthKey, snapshot.monthLabel);
    }
  }

  return [...months.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, label]) => ({ key, label }));
}

function buildIndicatorTrendSeries(
  plants: PlantSummary[],
  metricId: MetricId,
  selectedPlantCodes: string[],
  activePlantCode: string | null,
) {
  const monthAxis = getMonthAxis(plants);
  const comparePlants = selectedPlantCodes.length > 1;

  if (comparePlants) {
    const selectedPlants = plants.filter((plant) => selectedPlantCodes.includes(plant.code)).slice(0, COLORS.length);
    return {
      labels: monthAxis.map((month) => month.label),
      series: selectedPlants.map((plant) => ({
        key: plant.code,
        label: plant.name,
        values: monthAxis.map((month) => {
          const snapshot = plant.monthlyMetrics.find((entry) => entry.monthKey === month.key);
          return snapshot ? metricValue(snapshot, metricId) : 0;
        }),
      })),
    };
  }

  return {
    labels: monthAxis.map((month) => month.label),
    series: [
      {
        key: activePlantCode ?? "global",
        label: activePlantCode ? plants.find((plant) => plant.code === activePlantCode)?.name ?? "Plant" : "Global",
        values: monthAxis.map((month) =>
          plants.reduce((sum, plant) => {
            if (activePlantCode && plant.code !== activePlantCode) return sum;
            const snapshot = plant.monthlyMetrics.find((entry) => entry.monthKey === month.key);
            return sum + (snapshot ? metricValue(snapshot, metricId) : 0);
          }, 0),
        ),
      },
    ],
  };
}

function buildIndicatorDistribution(
  plants: PlantSummary[],
  metricId: MetricId,
  selectedPlantCodes: string[],
  activePlantCode: string | null,
) {
  if (selectedPlantCodes.length > 1) {
    return plants
      .filter((plant) => selectedPlantCodes.includes(plant.code))
      .slice(0, COLORS.length)
      .map((plant) => ({
        key: plant.code,
        label: plant.name,
        value: sumMetric(plant.monthlyMetrics, metricId),
      }));
  }

  const monthAxis = getMonthAxis(plants);
  return monthAxis.map((month) => ({
    key: month.key,
    label: month.label,
    value: plants.reduce((sum, plant) => {
      if (activePlantCode && plant.code !== activePlantCode) return sum;
      const snapshot = plant.monthlyMetrics.find((entry) => entry.monthKey === month.key);
      return sum + (snapshot ? metricValue(snapshot, metricId) : 0);
    }, 0),
  }));
}

function buildRankingTrendSeries(
  snapshots: RankingSeriesSnapshot[],
  currentEntries: Array<{ plantCode: string; plantName: string }>,
) {
  const labels = snapshots.map((snapshot) => snapshot.monthLabel);
  const tracked = currentEntries.slice(0, COLORS.length);
  const series = tracked.map((entry) => ({
    key: entry.plantCode,
    label: entry.plantName,
    values: snapshots.map((snapshot) => snapshot.entries.find((item) => item.plantCode === entry.plantCode)?.value ?? 0),
  }));

  return { labels, series };
}

function buildRankingDistribution(
  snapshots: RankingSeriesSnapshot[],
  currentEntries: Array<{ plantCode: string; plantName: string; value: number }>,
  variant: "count" | "percent" | "index",
) {
  if (variant !== "count") {
    return currentEntries.slice(0, COLORS.length).map((entry) => ({
      key: entry.plantCode,
      label: entry.plantName,
      value: entry.value,
    }));
  }

  return currentEntries.slice(0, COLORS.length).map((entry) => ({
    key: entry.plantCode,
    label: entry.plantName,
    value: snapshots.reduce(
      (sum, snapshot) => sum + (snapshot.entries.find((item) => item.plantCode === entry.plantCode)?.value ?? 0),
      0,
    ),
  }));
}

function TrendBarChart({
  labels,
  series,
  variant,
  maxLabel,
  title,
  monthLabel,
  noDataLabel,
}: {
  labels: string[];
  series: TrendSeries[];
  variant: "count" | "percent" | "index";
  maxLabel: string;
  title: string;
  monthLabel: string;
  noDataLabel: string;
}) {
  const hasValues = series.some((entry) => entry.values.some((value) => value !== 0));
  if (labels.length === 0 || !hasValues) return <div className="app-empty" role="status">{noDataLabel}</div>;

  const width = 720;
  const height = 260;
  const chartHeight = 180;
  const chartWidth = 660;
  const maxValue = Math.max(1, ...series.flatMap((entry) => entry.values));
  const groupWidth = chartWidth / Math.max(labels.length, 1);
  const barWidth = Math.max(10, (groupWidth - 14) / Math.max(series.length, 1));

  return (
    <figure className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[720px]" role="img" aria-label={`${title}. ${monthLabel} on the horizontal axis.`}>
        <title>{title}</title>
        <line x1="40" y1="210" x2="700" y2="210" stroke="var(--chart-axis)" />
        {labels.map((label, labelIndex) => (
          <g key={label} transform={`translate(${40 + labelIndex * groupWidth}, 0)`}>
            {series.map((entry, seriesIndex) => {
              const value = entry.values[labelIndex] ?? 0;
              const barHeight = (value / maxValue) * chartHeight;
              return (
                <rect
                  key={`${entry.key}-${label}`}
                  x={8 + seriesIndex * barWidth}
                  y={210 - barHeight}
                  width={barWidth - 4}
                  height={barHeight}
                  rx="6"
                  fill={COLORS[seriesIndex % COLORS.length]}
                />
              );
            })}
            <text x={groupWidth / 2} y="232" textAnchor="middle" fontSize="11" fill="var(--chart-text-muted)">
              {label}
            </text>
          </g>
        ))}
        <text x="40" y="24" fontSize="12" fill="var(--chart-text-muted)">
          {maxLabel}: {formatValue(maxValue, variant)}
        </text>
        <text x="370" y="254" textAnchor="middle" fontSize="11" fill="var(--chart-text-muted)">{monthLabel}</text>
      </svg>
      <figcaption className="sr-only">{title}</figcaption>
    </figure>
  );
}

function TrendPointsChart({
  labels,
  series,
  variant,
  maxLabel,
  title,
  monthLabel,
  noDataLabel,
}: {
  labels: string[];
  series: TrendSeries[];
  variant: "count" | "percent" | "index";
  maxLabel: string;
  title: string;
  monthLabel: string;
  noDataLabel: string;
}) {
  const hasValues = series.some((entry) => entry.values.some((value) => value !== 0));
  if (labels.length === 0 || !hasValues) return <div className="app-empty" role="status">{noDataLabel}</div>;

  const width = 720;
  const height = 260;
  const maxValue = Math.max(1, ...series.flatMap((entry) => entry.values));
  const chartWidth = 660;
  const stepX = labels.length > 1 ? chartWidth / (labels.length - 1) : chartWidth;

  return (
    <figure className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[720px]" role="img" aria-label={`${title}. ${monthLabel} on the horizontal axis.`}>
        <title>{title}</title>
        <line x1="40" y1="210" x2="700" y2="210" stroke="var(--chart-axis)" />
        {series.map((entry, seriesIndex) => {
          const points = entry.values
            .map((value, pointIndex) => {
              const x = 40 + pointIndex * stepX;
              const y = 210 - (value / maxValue) * 170;
              return `${x},${y}`;
            })
            .join(" ");

          return (
            <g key={entry.key}>
              <polyline fill="none" stroke={COLORS[seriesIndex % COLORS.length]} strokeWidth="3" points={points} />
              {entry.values.map((value, pointIndex) => {
                const x = 40 + pointIndex * stepX;
                const y = 210 - (value / maxValue) * 170;
                return <circle key={`${entry.key}-${labels[pointIndex]}`} cx={x} cy={y} r="4.5" fill={COLORS[seriesIndex % COLORS.length]} />;
              })}
            </g>
          );
        })}
        {labels.map((label, labelIndex) => (
          <text key={label} x={40 + labelIndex * stepX} y="232" textAnchor="middle" fontSize="11" fill="var(--chart-text-muted)">
            {label}
          </text>
        ))}
        <text x="40" y="24" fontSize="12" fill="var(--chart-text-muted)">
          {maxLabel}: {formatValue(maxValue, variant)}
        </text>
        <text x="370" y="254" textAnchor="middle" fontSize="11" fill="var(--chart-text-muted)">{monthLabel}</text>
      </svg>
      <figcaption className="sr-only">{title}</figcaption>
    </figure>
  );
}

function CircularChart({
  data,
  variant,
  labels,
}: {
  data: DistributionDatum[];
  variant: "count" | "percent" | "index";
  labels: Pick<DashboardUiDictionary, "noDataForPeriod" | "total">;
}) {
  const rawTotal = data.reduce((sum, item) => sum + item.value, 0);
  if (data.length === 0 || rawTotal === 0) {
    return <div className="app-empty">{labels.noDataForPeriod}</div>;
  }

  const total = variant === "percent" ? 100 : Math.max(1, data.reduce((sum, item) => sum + item.value, 0));
  const arcs = data.map((item, index) => {
    const startValue = data.slice(0, index).reduce((sum, current) => sum + current.value, 0);
    const endValue = startValue + item.value;
    return {
      item,
      index,
      start: startValue / total,
      end: endValue / total,
    };
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center">
      <svg viewBox="0 0 220 220" className="mx-auto h-[220px] w-[220px]">
        {arcs.map(({ item, index, start, end }) => {
          const largeArc = end - start > 0.5 ? 1 : 0;
          const startAngle = start * Math.PI * 2 - Math.PI / 2;
          const endAngle = end * Math.PI * 2 - Math.PI / 2;
          const x1 = 110 + Math.cos(startAngle) * 78;
          const y1 = 110 + Math.sin(startAngle) * 78;
          const x2 = 110 + Math.cos(endAngle) * 78;
          const y2 = 110 + Math.sin(endAngle) * 78;
          return (
            <path
              key={item.key}
              d={`M ${x1} ${y1} A 78 78 0 ${largeArc} 1 ${x2} ${y2}`}
              stroke={COLORS[index % COLORS.length]}
              strokeWidth="28"
              fill="none"
              strokeLinecap="round"
            />
          );
        })}
        <text x="110" y="102" textAnchor="middle" fontSize="14" fill="var(--chart-text-muted)">
          {labels.total}
        </text>
        <text x="110" y="124" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--chart-text-strong)">
          {formatValue(total, variant)}
        </text>
      </svg>
      <div className="space-y-2">
        {data.map((item, index) => {
          const share = total > 0 ? (item.value / total) * 100 : 0;
          return (
            <div key={item.key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <span className="flex items-center gap-2 text-sm text-slate-700">
                <span className="inline-flex h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                {item.label}
              </span>
              <span className="text-sm font-semibold text-slate-900">
                {formatValue(item.value, variant)} ({share.toFixed(1)}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ParetoChart({
  data,
  variant,
  labels,
}: {
  data: DistributionDatum[];
  variant: "count" | "percent" | "index";
  labels: Pick<DashboardUiDictionary, "noDataForPeriod" | "total">;
}) {
  const rawTotal = data.reduce((sum, item) => sum + item.value, 0);
  if (data.length === 0 || rawTotal === 0) {
    return <div className="app-empty">{labels.noDataForPeriod}</div>;
  }

  const sorted = [...data].sort((a, b) => b.value - a.value);
  const total = variant === "percent" ? 100 : Math.max(1, sorted.reduce((sum, item) => sum + item.value, 0));
  const width = 720;
  const height = 280;
  const maxValue = Math.max(1, ...sorted.map((item) => item.value));
  const cumulativeValues = sorted.map((_, index) => sorted.slice(0, index + 1).reduce((sum, item) => sum + item.value, 0));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[720px]">
        <line x1="40" y1="220" x2="700" y2="220" stroke="var(--chart-axis)" />
        {sorted.map((item, index) => {
          const barWidth = 620 / Math.max(sorted.length, 1);
          const barHeight = (item.value / maxValue) * 170;
          const x = 56 + index * barWidth;
          const percentY = 220 - ((cumulativeValues[index] / total) * 170);
          return (
            <g key={item.key}>
              <rect x={x} y={220 - barHeight} width={barWidth - 16} height={barHeight} rx="6" fill={COLORS[index % COLORS.length]} />
              <circle cx={x + (barWidth - 16) / 2} cy={percentY} r="4" fill="var(--chart-line)" />
              {index > 0 ? (
                <line
                  x1={56 + (index - 1) * barWidth + (barWidth - 16) / 2}
                  y1={220 - ((sorted.slice(0, index).reduce((sum, entry) => sum + entry.value, 0) / total) * 170)}
                  x2={x + (barWidth - 16) / 2}
                  y2={percentY}
                  stroke="var(--chart-line)"
                  strokeWidth="2"
                />
              ) : null}
              <text x={x + (barWidth - 16) / 2} y="242" textAnchor="middle" fontSize="11" fill="var(--chart-text-muted)">
                {item.label}
              </text>
            </g>
          );
        })}
        <text x="40" y="24" fontSize="12" fill="var(--chart-text-muted)">
          {labels.total}: {formatValue(total, variant)}
        </text>
      </svg>
    </div>
  );
}

function ChartLegend({ series }: { series: Array<{ key: string; label: string }> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {series.map((entry, index) => (
        <div key={entry.key} className="app-chip h-8 text-xs">
          <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
          {entry.label}
        </div>
      ))}
    </div>
  );
}

export function DashboardVisualizationStudio({
  plants,
  rankings,
  rankingMonthlySeries,
  activePlantCode,
  storageKeyBase,
  rootCauseMetricLabel,
  labels = getUiDictionary("en").dashboard,
}: Props) {
  const text = labels;
  const rootCauseLabel = rootCauseMetricLabel ?? text.sewoRootCauses;
  const monthAxis = useMemo(() => getMonthAxis(plants), [plants]);
  const metricOptions = useMemo(
    () =>
      METRIC_OPTIONS.map((metric) =>
        metric.id === "rootCauses" ? { ...metric, label: rootCauseLabel } : { ...metric, label: text[metric.labelKey] },
      ),
    [rootCauseLabel, text],
  );
  const trendChartsEnabled = monthAxis.length > 1;
  const chartStorageKey = `${storageKeyBase}-chart-type`;
  const [chartType, setChartType] = useState<ChartType>(getDefaultChartType(trendChartsEnabled));
  const [selectedMetricId, setSelectedMetricId] = useState<MetricId>("nearMisses");
  const [selectedRankingId, setSelectedRankingId] = useState<string>(() => {
    const panels = rankings.flatMap((group) => {
      if (group.higherLabel) return [`${group.id}-higher`];
      if (group.lowerLabel) return [`${group.id}-lower`];
      return [group.id];
    });
    return panels[0] ?? "";
  });
  const [selectedPlantCodes, setSelectedPlantCodes] = useState<string[]>(() =>
    activePlantCode ? [activePlantCode] : plants.slice(0, 3).map((plant) => plant.code),
  );

  const rankingPanels = useMemo(
    () =>
      rankings.flatMap((group) => {
        const panels: Array<{ id: string; title: string; variant: RankingGroup["variant"]; entries: RankingGroup["higher"] }> = [];
        if (group.higherLabel) panels.push({ id: `${group.id}-higher`, title: group.higherLabel, variant: group.variant, entries: group.higher });
        if (group.lowerLabel) panels.push({ id: `${group.id}-lower`, title: group.lowerLabel, variant: group.variant, entries: group.lower });
        if (!group.higherLabel && !group.lowerLabel) panels.push({ id: group.id, title: group.title, variant: group.variant, entries: group.higher });
        return panels;
      }),
    [rankings],
  );

  useEffect(() => {
    const nextChartType = resolveStoredChartType(window.localStorage.getItem(chartStorageKey), trendChartsEnabled);
    setChartType((current) => (current === nextChartType ? current : nextChartType));
    window.localStorage.setItem(chartStorageKey, nextChartType);
  }, [chartStorageKey, trendChartsEnabled]);

  const selectedMetric = metricOptions.find((metric) => metric.id === selectedMetricId) ?? metricOptions[0];
  const indicatorTrend = useMemo(
    () => buildIndicatorTrendSeries(plants, selectedMetricId, selectedPlantCodes, activePlantCode),
    [activePlantCode, plants, selectedMetricId, selectedPlantCodes],
  );
  const indicatorDistribution = useMemo(
    () => buildIndicatorDistribution(plants, selectedMetricId, selectedPlantCodes, activePlantCode),
    [activePlantCode, plants, selectedMetricId, selectedPlantCodes],
  );

  const selectedRankingPanel = rankingPanels.find((panel) => panel.id === selectedRankingId) ?? rankingPanels[0];
  const rankingSnapshots = useMemo(
    () => (selectedRankingPanel ? rankingMonthlySeries[selectedRankingPanel.id] ?? [] : []),
    [rankingMonthlySeries, selectedRankingPanel],
  );
  const rankingTrend = useMemo(
    () => (selectedRankingPanel ? buildRankingTrendSeries(rankingSnapshots, selectedRankingPanel.entries) : { labels: [], series: [] }),
    [rankingSnapshots, selectedRankingPanel],
  );
  const rankingDistribution = useMemo(
    () => (selectedRankingPanel ? buildRankingDistribution(rankingSnapshots, selectedRankingPanel.entries, selectedRankingPanel.variant) : []),
    [rankingSnapshots, selectedRankingPanel],
  );

  const togglePlant = (plantCode: string) => {
    setSelectedPlantCodes((current) => {
      if (current.includes(plantCode)) {
        const next = current.filter((code) => code !== plantCode);
        return next.length > 0 ? next : current;
      }
      return [...current, plantCode].slice(0, COLORS.length);
    });
  };

  const handleChartTypeChange = (nextChartType: ChartType) => {
    setChartType(nextChartType);
    window.localStorage.setItem(chartStorageKey, nextChartType);
  };

  return (
    <section className="app-card-muted p-4">
      <AppSectionHeader
        eyebrow={text.visualAnalysis}
        title={<span className="sr-only">{text.visualAnalysis}</span>}
        actions={
          <div className="flex flex-wrap gap-2">
          <HelpPopover title={text.visualAnalysis} body={text.visualAnalysisDescription} buttonLabel={text.help} />
          {(["bar", "circular", "points", "pareto"] as ChartType[]).map((type) => {
            const disabled = !trendChartsEnabled && (type === "bar" || type === "points");
            return (
              <button
                key={type}
                type="button"
                disabled={disabled}
                className={`app-chip disabled:cursor-not-allowed disabled:opacity-45 ${
                  chartType === type
                    ? "app-chip--active"
                    : ""
                }`}
                onClick={() => handleChartTypeChange(type)}
              >
                {type === "bar" ? text.bars : type === "circular" ? text.circular : type === "points" ? text.points : text.pareto}
              </button>
            );
          })}
          </div>
        }
      />

      <div className="mt-4 space-y-4">
          {plants.length > 1 ? (
            <AppCard>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{text.comparePlants}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {plants.slice(0, 10).map((plant) => {
                  const selected = selectedPlantCodes.includes(plant.code);
                  return (
                    <button
                      key={plant.code}
                      type="button"
                      className={`app-chip ${selected ? "app-chip--active" : ""}`}
                      onClick={() => togglePlant(plant.code)}
                    >
                      {plant.name}
                    </button>
                  );
                })}
              </div>
            </AppCard>
          ) : null}

          <AppCard>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <label className="space-y-1 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{text.indicator}</span>
                <select
                  value={selectedMetricId}
                  onChange={(event) => setSelectedMetricId(event.target.value as MetricId)}
                  className="h-10 rounded-[10px] border border-slate-300 bg-white px-3 text-sm text-slate-900"
                >
                  {metricOptions.map((metric) => (
                    <option key={metric.id} value={metric.id}>
                      {metric.label}
                    </option>
                  ))}
                </select>
              </label>
              <ChartLegend series={chartType === "bar" || chartType === "points" ? indicatorTrend.series : indicatorDistribution} />
            </div>
            <div className="mt-4">
              {chartType === "bar" ? (
                <TrendBarChart
                  labels={indicatorTrend.labels}
                  series={indicatorTrend.series}
                  variant={selectedMetric.variant}
                  maxLabel={text.max}
                  title={`${text.monthlyTrend}: ${selectedMetric.label}`}
                  monthLabel={text.month}
                  noDataLabel={text.noDataForPeriod}
                />
              ) : null}
              {chartType === "points" ? (
                <TrendPointsChart
                  labels={indicatorTrend.labels}
                  series={indicatorTrend.series}
                  variant={selectedMetric.variant}
                  maxLabel={text.max}
                  title={`${text.monthlyTrend}: ${selectedMetric.label}`}
                  monthLabel={text.month}
                  noDataLabel={text.noDataForPeriod}
                />
              ) : null}
              {chartType === "circular" ? <CircularChart data={indicatorDistribution} variant={selectedMetric.variant} labels={text} /> : null}
              {chartType === "pareto" ? <ParetoChart data={indicatorDistribution} variant={selectedMetric.variant} labels={text} /> : null}
            </div>
          </AppCard>

          {selectedRankingPanel ? (
            <AppCard>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{text.topRanking}</span>
                  <select
                    value={selectedRankingPanel.id}
                    onChange={(event) => setSelectedRankingId(event.target.value)}
                    className="h-10 rounded-[10px] border border-slate-300 bg-white px-3 text-sm text-slate-900"
                  >
                    {rankingPanels.map((panel) => (
                      <option key={panel.id} value={panel.id}>
                        {panel.title}
                      </option>
                    ))}
                  </select>
                </label>
                <ChartLegend series={chartType === "bar" || chartType === "points" ? rankingTrend.series : rankingDistribution} />
              </div>
              <div className="mt-4">
                {chartType === "bar" ? (
                  <TrendBarChart
                    labels={rankingTrend.labels}
                    series={rankingTrend.series}
                    variant={selectedRankingPanel.variant}
                    maxLabel={text.max}
                    title={`${text.monthlyTrend}: ${selectedRankingPanel.title}`}
                    monthLabel={text.month}
                    noDataLabel={text.noDataForPeriod}
                  />
                ) : null}
                {chartType === "points" ? (
                  <TrendPointsChart
                    labels={rankingTrend.labels}
                    series={rankingTrend.series}
                    variant={selectedRankingPanel.variant}
                    maxLabel={text.max}
                    title={`${text.monthlyTrend}: ${selectedRankingPanel.title}`}
                    monthLabel={text.month}
                    noDataLabel={text.noDataForPeriod}
                  />
                ) : null}
                {chartType === "circular" ? <CircularChart data={rankingDistribution} variant={selectedRankingPanel.variant} labels={text} /> : null}
                {chartType === "pareto" ? <ParetoChart data={rankingDistribution} variant={selectedRankingPanel.variant} labels={text} /> : null}
              </div>
            </AppCard>
          ) : null}
      </div>
    </section>
  );
}
