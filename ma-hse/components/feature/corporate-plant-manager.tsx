"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RoleCode } from "@prisma/client";
import { buttonVariants } from "@/components/ui/button";
import { CommunicationPyramid } from "@/components/feature/communication-pyramid";

export type PlantSummary = {
  id: string;
  code: string;
  name: string;
  timezone: string;
  defaultLanguage: string;
  validatedEvents: number;
  openActions: number;
  closedActions: number;
  actionsToClose: number;
  closedActionsPercent: number;
  actionsToClosePercent: number;
  nearMissCount: number;
  injuryCount: number;
  frequencyIndex: number;
  severityIndex: number;
  communicationPyramid: {
    unsafeAct: number;
    unsafeCondition: number;
    nearMiss: number;
    firstAid: number;
    minorInjury: number;
    seriousInjury: number;
    fatal: number;
  };
  leaders: Array<{
    role: RoleCode;
    email: string | null;
    name: string;
  }>;
};

type RankingEntry = {
  plantCode: string;
  plantName: string;
  value: number;
};

export type RankingGroup = {
  id: string;
  title: string;
  variant: "count" | "percent" | "index";
  higherLabel?: string;
  lowerLabel?: string;
  higher: RankingEntry[];
  lower: RankingEntry[];
};

type RankingPanel = {
  id: string;
  title: string;
  variant: "count" | "percent" | "index";
  entries: RankingEntry[];
};

type CorporatePlantManagerProps = {
  initialPlants: PlantSummary[];
  totalPlants: number;
  totalValidatedEvents: number;
  totalOpenActions: number;
  totalClosedActions: number;
  totalActionsToClose: number;
  totalClosedActionsPercent: number;
  totalActionsToClosePercent: number;
  totalNearMisses: number;
  totalInjuries: number;
  totalFrequencyIndex: number;
  totalSeverityIndex: number;
  totalCommunicationPyramid: {
    unsafeAct: number;
    unsafeCondition: number;
    nearMiss: number;
    firstAid: number;
    minorInjury: number;
    seriousInjury: number;
    fatal: number;
  };
  rankings: RankingGroup[];
  title?: string;
  description?: string;
  plantListTitle?: string;
  plantListDescription?: string;
  favoriteMetricsDescription?: string;
  favoriteRankingsDescription?: string;
  pyramidDescription?: string;
  storageKeyBase?: string;
  initialActivePlantCode?: string | null;
  hidePlantList?: boolean;
  hideRankings?: boolean;
  hidePyramid?: boolean;
  showCreatePlantLink?: boolean;
};

type MetricId =
  | "plants"
  | "validatedEvents"
  | "openActions"
  | "closedActions"
  | "actionsToClose"
  | "closedActionsPercent"
  | "actionsToClosePercent"
  | "nearMisses"
  | "injuries"
  | "frequencyRate"
  | "gravityRate";

type MetricDefinition = {
  id: MetricId;
  label: string;
  variant: "count" | "percent" | "index";
  tone?: "default" | "danger" | "success";
  globalValue: number;
  plantValue: number;
  showInGlobal: boolean;
};

const DEFAULT_FAVORITE_METRICS: MetricId[] = [
  "plants",
  "openActions",
  "actionsToClose",
  "nearMisses",
  "injuries",
  "frequencyRate",
];
const DEFAULT_FAVORITE_RANKINGS = [
  "nearMisses-higher",
  "nearMisses-lower",
  "injuries-higher",
  "injuries-lower",
  "frequencyRate-higher",
  "frequencyRate-lower",
];

function formatValue(value: number, variant: "count" | "percent" | "index") {
  if (variant === "percent") {
    return `${value.toFixed(1)}%`;
  }

  if (variant === "index") {
    return value.toFixed(2);
  }

  return value.toLocaleString();
}

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger" | "success";
}) {
  const valueClassName =
    tone === "danger" ? "text-red-700" : tone === "success" ? "text-emerald-700" : "text-slate-900";

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1.5 text-xl font-bold ${valueClassName}`}>{value}</p>
    </article>
  );
}

function RankingCard({
  title,
  entries,
  activePlantCode,
  variant,
}: {
  title: string;
  entries: RankingEntry[];
  activePlantCode: string | null;
  variant: "count" | "percent" | "index";
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <ol className="mt-3 space-y-1.5 text-sm">
        {entries.map((entry, index) => {
          const isActive = activePlantCode === entry.plantCode;

          return (
            <li
              key={`${title}-${entry.plantCode}`}
              className={`flex items-center justify-between gap-3 rounded-md px-2 py-1.5 ${
                isActive ? "bg-teal-50 text-teal-900" : "bg-slate-50 text-slate-700"
              }`}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-slate-500">
                  {index + 1}
                </span>
                <span className="truncate">{entry.plantName}</span>
              </span>
              <span className="ml-2 shrink-0 text-right font-semibold">{formatValue(entry.value, variant)}</span>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

export function CorporatePlantManager({
  initialPlants,
  totalPlants,
  totalValidatedEvents,
  totalOpenActions,
  totalClosedActions,
  totalActionsToClose,
  totalClosedActionsPercent,
  totalActionsToClosePercent,
  totalNearMisses,
  totalInjuries,
  totalFrequencyIndex,
  totalSeverityIndex,
  totalCommunicationPyramid,
  rankings,
  title = "Corporate Indicators",
  description = "Global values are shown by default. Hover a plant to preview its indicators.",
  plantListTitle = "Corporate Plants",
  plantListDescription = "Hover a plant to preview its indicators right beside it.",
  favoriteMetricsDescription = "Choose the cards that should appear by default on the corporate dashboard.",
  favoriteRankingsDescription = "Compact Top 5 comparisons for the selected favorite rankings.",
  pyramidDescription = "Global communication totals are shown by default. Hover a plant to preview the same pyramid for that plant.",
  storageKeyBase = "ma-hse-corporate",
  initialActivePlantCode = null,
  hidePlantList = false,
  hideRankings = false,
  hidePyramid = false,
  showCreatePlantLink = true,
}: CorporatePlantManagerProps) {
  const favoriteMetricsStorageKey = `${storageKeyBase}-favorite-metrics`;
  const favoriteRankingsStorageKey = `${storageKeyBase}-favorite-rankings`;
  const [activePlantCode, setActivePlantCode] = useState<string | null>(initialActivePlantCode);
  const [favoriteMetricIds, setFavoriteMetricIds] = useState<MetricId[]>(DEFAULT_FAVORITE_METRICS);
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  const [favoriteRankingIds, setFavoriteRankingIds] = useState<string[]>(DEFAULT_FAVORITE_RANKINGS);
  const [showAllRankings, setShowAllRankings] = useState(false);

  const activePlant = useMemo(
    () => initialPlants.find((plant) => plant.code === activePlantCode) ?? null,
    [activePlantCode, initialPlants],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
    try {
      const storedMetrics = window.localStorage.getItem(favoriteMetricsStorageKey);
      if (storedMetrics) {
        const parsed = JSON.parse(storedMetrics);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setFavoriteMetricIds(parsed as MetricId[]);
        }
      }

      const storedRankings = window.localStorage.getItem(favoriteRankingsStorageKey);
      if (storedRankings) {
        const parsed = JSON.parse(storedRankings);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setFavoriteRankingIds(parsed as string[]);
        }
      }
    } catch {
      window.localStorage.removeItem(favoriteMetricsStorageKey);
      window.localStorage.removeItem(favoriteRankingsStorageKey);
    }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [favoriteMetricsStorageKey, favoriteRankingsStorageKey]);

  useEffect(() => {
    window.localStorage.setItem(favoriteMetricsStorageKey, JSON.stringify(favoriteMetricIds));
  }, [favoriteMetricIds, favoriteMetricsStorageKey]);

  useEffect(() => {
    window.localStorage.setItem(favoriteRankingsStorageKey, JSON.stringify(favoriteRankingIds));
  }, [favoriteRankingIds, favoriteRankingsStorageKey]);

  const scopeLabel = activePlant ? `${activePlant.name} (${activePlant.code.toUpperCase()})` : "Global";
  const allMetrics = useMemo<MetricDefinition[]>(
    () => [
      {
        id: "plants",
        label: "Plants",
        variant: "count",
        tone: "default",
        globalValue: totalPlants,
        plantValue: 1,
        showInGlobal: true,
      },
      {
        id: "validatedEvents",
        label: "Validated events",
        variant: "count",
        tone: "default",
        globalValue: totalValidatedEvents,
        plantValue: activePlant?.validatedEvents ?? 0,
        showInGlobal: false,
      },
      {
        id: "openActions",
        label: "Open actions",
        variant: "count",
        tone: "default",
        globalValue: totalOpenActions,
        plantValue: activePlant?.openActions ?? 0,
        showInGlobal: true,
      },
      {
        id: "closedActions",
        label: "Closed actions",
        variant: "count",
        tone: "success",
        globalValue: totalClosedActions,
        plantValue: activePlant?.closedActions ?? 0,
        showInGlobal: true,
      },
      {
        id: "actionsToClose",
        label: "Actions to close",
        variant: "count",
        tone: "danger",
        globalValue: totalActionsToClose,
        plantValue: activePlant?.actionsToClose ?? 0,
        showInGlobal: true,
      },
      {
        id: "closedActionsPercent",
        label: "% closed actions",
        variant: "percent",
        tone: "default",
        globalValue: totalClosedActionsPercent,
        plantValue: activePlant?.closedActionsPercent ?? 0,
        showInGlobal: true,
      },
      {
        id: "actionsToClosePercent",
        label: "% actions to close",
        variant: "percent",
        tone: "default",
        globalValue: totalActionsToClosePercent,
        plantValue: activePlant?.actionsToClosePercent ?? 0,
        showInGlobal: true,
      },
      {
        id: "nearMisses",
        label: "Near misses",
        variant: "count",
        tone: "default",
        globalValue: totalNearMisses,
        plantValue: activePlant?.nearMissCount ?? 0,
        showInGlobal: true,
      },
      {
        id: "injuries",
        label: "Injuries",
        variant: "count",
        tone: "default",
        globalValue: totalInjuries,
        plantValue: activePlant?.injuryCount ?? 0,
        showInGlobal: true,
      },
      {
        id: "frequencyRate",
        label: "Frequency rate",
        variant: "index",
        tone: "default",
        globalValue: totalFrequencyIndex,
        plantValue: activePlant?.frequencyIndex ?? 0,
        showInGlobal: true,
      },
      {
        id: "gravityRate",
        label: "Gravity rate",
        variant: "index",
        tone: "default",
        globalValue: totalSeverityIndex,
        plantValue: activePlant?.severityIndex ?? 0,
        showInGlobal: true,
      },
    ],
    [
      activePlant,
      totalActionsToClose,
      totalActionsToClosePercent,
      totalClosedActions,
      totalClosedActionsPercent,
      totalFrequencyIndex,
      totalInjuries,
      totalNearMisses,
      totalOpenActions,
      totalPlants,
      totalSeverityIndex,
      totalValidatedEvents,
    ],
  );

  const availableMetrics = useMemo(
    () => allMetrics.filter((metric) => activePlant || metric.showInGlobal),
    [activePlant, allMetrics],
  );

  const favoriteMetrics = useMemo(() => {
    const metrics = availableMetrics.filter((metric) => favoriteMetricIds.includes(metric.id));
    return metrics.length > 0 ? metrics : availableMetrics.slice(0, 6);
  }, [availableMetrics, favoriteMetricIds]);

  const extraMetrics = useMemo(
    () => availableMetrics.filter((metric) => !favoriteMetrics.some((favorite) => favorite.id === metric.id)),
    [availableMetrics, favoriteMetrics],
  );

  const visibleMetrics = showAllMetrics ? [...favoriteMetrics, ...extraMetrics] : favoriteMetrics;
  const rankingPanels = useMemo<RankingPanel[]>(
    () =>
      rankings.flatMap((group) => {
        const panels: RankingPanel[] = [];

        if (group.higherLabel) {
          panels.push({
            id: `${group.id}-higher`,
            title: group.higherLabel,
            variant: group.variant,
            entries: group.higher,
          });
        }

        if (group.lowerLabel) {
          panels.push({
            id: `${group.id}-lower`,
            title: group.lowerLabel,
            variant: group.variant,
            entries: group.lower,
          });
        }

        if (!group.higherLabel && !group.lowerLabel) {
          panels.push({
            id: group.id,
            title: group.title,
            variant: group.variant,
            entries: group.higher,
          });
        }

        return panels;
      }),
    [rankings],
  );

  const favoriteRankings = useMemo(() => {
    const panels = rankingPanels.filter((panel) => favoriteRankingIds.includes(panel.id));
    return panels.length > 0 ? panels : rankingPanels.slice(0, 6);
  }, [favoriteRankingIds, rankingPanels]);

  const extraRankings = useMemo(
    () => rankingPanels.filter((panel) => !favoriteRankings.some((favorite) => favorite.id === panel.id)),
    [favoriteRankings, rankingPanels],
  );

  const visibleRankings = showAllRankings ? [...favoriteRankings, ...extraRankings] : favoriteRankings;

  const toggleFavoriteMetric = (metricId: MetricId) => {
    setFavoriteMetricIds((current) => {
      if (current.includes(metricId)) {
        const next = current.filter((id) => id !== metricId);
        return next.length > 0 ? next : current;
      }

      return [...current, metricId];
    });
  };

  const toggleFavoriteRanking = (rankingId: string) => {
    setFavoriteRankingIds((current) => {
      if (current.includes(rankingId)) {
        const next = current.filter((id) => id !== rankingId);
        return next.length > 0 ? next : current;
      }

      return [...current, rankingId];
    });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <header>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
            <p className="mt-1 text-xs text-slate-600">{description}</p>
          </header>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Scope: {scopeLabel}
          </div>
        </div>

        <div className={`mt-4 grid gap-4 ${hidePlantList ? "" : "xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start"}`}>
          {hidePlantList ? null : (
            <section
              className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 xl:sticky xl:top-6 xl:max-h-[calc(100vh-7rem)] xl:overflow-hidden xl:hover:overflow-y-auto"
              onMouseLeave={() => setActivePlantCode(initialActivePlantCode)}
            >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{plantListTitle}</h3>
                <p className="mt-1 text-sm text-slate-700">{plantListDescription}</p>
              </div>
              {showCreatePlantLink ? (
                <Link
                  href="/app/corporate/plants/new"
                  className={`${buttonVariants({ size: "sm" })} min-w-[110px] px-4 leading-none !text-white`}
                >
                  Create plant
                </Link>
              ) : null}
            </div>

            <div className="grid gap-3 max-xl:grid-cols-2">
              {initialPlants.map((plant) => (
                <Link
                  key={plant.id}
                  href={`/app/${plant.code}/dashboards`}
                  className={`block rounded-lg border p-3 transition ${
                    activePlantCode === plant.code
                      ? "border-teal-400 bg-teal-50"
                      : "border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/40"
                  }`}
                  onMouseEnter={() => setActivePlantCode(plant.code)}
                  onFocus={() => setActivePlantCode(plant.code)}
                  onBlur={() => setActivePlantCode(null)}
                >
                  <article>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{plant.name}</p>
                        <p className="text-[11px] text-slate-500">
                          {plant.code.toUpperCase()} - {plant.timezone}
                        </p>
                      </div>
                      <span className={buttonVariants({ variant: "secondary", size: "sm" })}>Open</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md bg-slate-50 px-2 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">NM</p>
                        <p className="text-sm font-semibold text-slate-900">{plant.nearMissCount}</p>
                      </div>
                      <div className="rounded-md bg-slate-50 px-2 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Inj</p>
                        <p className="text-sm font-semibold text-slate-900">{plant.injuryCount}</p>
                      </div>
                      <div className="rounded-md bg-slate-50 px-2 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Open</p>
                        <p className="text-sm font-semibold text-slate-900">{plant.actionsToClose}</p>
                      </div>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
            </section>
          )}

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Favorite indicators</p>
                  <p className="mt-1 text-sm text-slate-700">{favoriteMetricsDescription}</p>
                </div>
                {extraMetrics.length > 0 ? (
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                    onClick={() => setShowAllMetrics((current) => !current)}
                  >
                    {showAllMetrics ? "Show less" : "Show more"}
                  </button>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {availableMetrics.map((metric) => {
                  const isFavorite = favoriteMetricIds.includes(metric.id);

                  return (
                    <button
                      key={metric.id}
                      type="button"
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                        isFavorite
                          ? "border-teal-300 bg-teal-100 text-teal-900"
                          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-100"
                      }`}
                      onClick={() => toggleFavoriteMetric(metric.id)}
                    >
                      {metric.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3 2xl:grid-cols-3">
              {visibleMetrics.map((metric) => (
                <MetricCard
                  key={metric.id}
                  label={metric.label}
                  value={formatValue(activePlant ? metric.plantValue : metric.globalValue, metric.variant)}
                  tone={metric.tone}
                />
              ))}
            </div>

            {hideRankings ? null : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">Plant rankings</p>
                  <p className="mt-1 text-sm text-slate-700">{favoriteRankingsDescription}</p>
                </div>
                {extraRankings.length > 0 ? (
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
                    onClick={() => setShowAllRankings((current) => !current)}
                  >
                    {showAllRankings ? "Show less" : "Show more"}
                  </button>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {rankingPanels.map((panel) => {
                  const isFavorite = favoriteRankingIds.includes(panel.id);

                  return (
                    <button
                      key={panel.id}
                      type="button"
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                        isFavorite
                          ? "border-teal-300 bg-teal-100 text-teal-900"
                          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-100"
                      }`}
                      onClick={() => toggleFavoriteRanking(panel.id)}
                    >
                      {panel.title}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3 2xl:grid-cols-3">
                {visibleRankings.map((panel) => (
                  <RankingCard
                    key={panel.id}
                    title={panel.title}
                    entries={panel.entries}
                    activePlantCode={activePlantCode}
                    variant={panel.variant}
                  />
                ))}
              </div>
              </div>
            )}

            {hidePyramid ? null : (
              <CommunicationPyramid
                title="Communication Pyramid"
                description={pyramidDescription}
                counts={activePlant ? activePlant.communicationPyramid : totalCommunicationPyramid}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
