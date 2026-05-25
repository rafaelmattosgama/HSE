"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import type { SafetyDaysSummary } from "@/lib/safety-days";
import { getUiDictionary, type DashboardUiDictionary } from "@/lib/ui-language";

const TOP_PLANTS_LIMIT = 5;

type SafetyDaysDashboardLabels = DashboardUiDictionary & {
  showAllPlants?: string;
  showTopFive?: string;
  samePeriodLastYearShort?: string;
};

export type PlantSafetyDays = {
  id: string;
  code: string;
  name: string;
  safetyDays: SafetyDaysSummary;
  currentFrequencyIndex?: number | null;
  previousYearFrequencyIndex?: number | null;
};

type FrequencyComparisonTone = "improved" | "worsened" | "neutral";

export function formatFrequencyIndexValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "N/A";
}

export function getFrequencyComparison(current: number | null | undefined, previous: number | null | undefined) {
  if (
    typeof current !== "number" ||
    !Number.isFinite(current) ||
    typeof previous !== "number" ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return {
      label: "N/A",
      tone: "neutral" as FrequencyComparisonTone,
    };
  }

  const roundedChange = Math.round((((current - previous) / previous) * 100) * 10) / 10;
  const normalizedChange = Object.is(roundedChange, -0) ? 0 : roundedChange;

  return {
    label: `${normalizedChange > 0 ? "+" : ""}${normalizedChange.toFixed(1)}%`,
    tone:
      normalizedChange < 0
        ? ("improved" as FrequencyComparisonTone)
        : normalizedChange > 0
          ? ("worsened" as FrequencyComparisonTone)
          : ("neutral" as FrequencyComparisonTone),
  };
}

function getFrequencyComparisonToneClass(tone: FrequencyComparisonTone) {
  if (tone === "improved") return "text-emerald-600";
  if (tone === "worsened") return "text-rose-600";
  return "text-slate-500";
}

function formatDate(dateKey: string | null, labels: DashboardUiDictionary) {
  if (!dateKey) return labels.noInjuryRecord;
  return dateKey;
}

function sortPlantsBySafetyDays(plants: PlantSafetyDays[]) {
  return [...plants].sort(
    (left, right) =>
      right.safetyDays.currentDays - left.safetyDays.currentDays ||
      right.safetyDays.recordDays - left.safetyDays.recordDays ||
      left.name.localeCompare(right.name),
  );
}

export function GroupSafetyDaysBoard({
  plants,
  labels = getUiDictionary("en").dashboard,
}: {
  plants: PlantSafetyDays[];
  labels?: SafetyDaysDashboardLabels;
}) {
  const [showAllPlants, setShowAllPlants] = useState(false);
  const sortedPlants = sortPlantsBySafetyDays(plants);
  const bestCurrent = sortedPlants[0];
  const bestRecord = [...plants].sort((left, right) => right.safetyDays.recordDays - left.safetyDays.recordDays)[0];
  const visiblePlants = showAllPlants ? sortedPlants : sortedPlants.slice(0, TOP_PLANTS_LIMIT);
  const canTogglePlants = sortedPlants.length > TOP_PLANTS_LIMIT;
  const showAllLabel = labels.showAllPlants ?? "Show all plants";
  const showTopFiveLabel = labels.showTopFive ?? `Show top ${TOP_PLANTS_LIMIT}`;
  const samePeriodLastYearLabel = labels.samePeriodLastYearShort ?? "vs same period last year";

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
      <div className="bg-[linear-gradient(135deg,#062c43_0%,#0f766e_48%,#f59e0b_100%)] p-6 text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
              <CalendarClock className="h-4 w-4" />
              {labels.groupSafetyDays}
            </div>
            <h2 className="mt-4 text-3xl font-black">{labels.daysWithoutAccidentsAcrossPlants}</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/25 bg-white/15 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/75">{labels.bestCurrent}</p>
              <p className="mt-1 text-2xl font-black">{bestCurrent?.safetyDays.currentDays.toLocaleString() ?? 0}</p>
              <p className="text-xs text-white/75">{bestCurrent?.name ?? "-"}</p>
            </div>
            <div className="rounded-xl border border-white/25 bg-white/15 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/75">{labels.bestRecord}</p>
              <p className="mt-1 text-2xl font-black">{bestRecord?.safetyDays.recordDays.toLocaleString() ?? 0}</p>
              <p className="text-xs text-white/75">{bestRecord?.name ?? "-"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
        {visiblePlants.map((plant) => {
          const comparison = getFrequencyComparison(plant.currentFrequencyIndex, plant.previousYearFrequencyIndex);

          return (
            <article
              key={plant.id}
              data-testid="group-safety-plant-card"
              data-plant-code={plant.code}
              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p data-testid="group-safety-plant-name" className="text-sm font-bold text-slate-900">
                    {plant.name}
                  </p>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{plant.code.toUpperCase()}</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                  {formatDate(plant.safetyDays.lastAccidentDate, labels)}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-emerald-100 px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{labels.current}</p>
                  <p className="text-2xl font-black text-emerald-950">{plant.safetyDays.currentDays.toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-amber-100 px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{labels.record}</p>
                  <p className="text-2xl font-black text-amber-950">{plant.safetyDays.recordDays.toLocaleString()}</p>
                </div>
              </div>
              <div className="mt-4 border-t border-slate-200 pt-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-500">{labels.frequencyRate}</span>
                  <span className="font-semibold text-slate-900">{formatFrequencyIndexValue(plant.currentFrequencyIndex)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-500">{samePeriodLastYearLabel}</span>
                  <span
                    data-testid="group-safety-frequency-change"
                    className={`font-semibold ${getFrequencyComparisonToneClass(comparison.tone)}`}
                  >
                    {comparison.label}
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {canTogglePlants ? (
        <div className="px-5 pb-5">
          <button
            type="button"
            aria-expanded={showAllPlants}
            onClick={() => setShowAllPlants((current) => !current)}
            className="inline-flex h-10 items-center justify-center rounded-full border border-teal-200 bg-white px-4 text-sm font-semibold text-teal-700 transition hover:bg-teal-50"
          >
            {showAllPlants ? showTopFiveLabel : showAllLabel}
          </button>
        </div>
      ) : null}
    </section>
  );
}
