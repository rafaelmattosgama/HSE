"use client";

import Link from "next/link";
import { useState } from "react";
import { Flame } from "lucide-react";
import { getUiDictionary, type DashboardUiDictionary } from "@/lib/ui-language";

const TOP_PLANTS_LIMIT = 5;

export type PlantFireEquipmentCoverage = {
  id: string;
  code: string;
  name: string;
  totalActive: number;
  compliantCount: number;
  coveragePercent: number | null;
  problemCount: number;
};

function formatCoverage(value: number | null, notApplicableLabel: string) {
  return value === null ? notApplicableLabel : `${value.toFixed(1)}%`;
}

function getCoverageToneClass(value: number | null) {
  if (value === null) return "bg-slate-100 text-slate-600";
  if (value >= 90) return "bg-emerald-100 text-emerald-950";
  if (value >= 75) return "bg-amber-100 text-amber-950";
  return "bg-rose-100 text-rose-950";
}

function getProblemToneClass(count: number) {
  return count === 0 ? "bg-emerald-100 text-emerald-950" : "bg-rose-100 text-rose-950";
}

function sortPlantsByCoverage(plants: PlantFireEquipmentCoverage[]) {
  return [...plants].sort((left, right) => {
    const leftCoverage = left.coveragePercent ?? Number.POSITIVE_INFINITY;
    const rightCoverage = right.coveragePercent ?? Number.POSITIVE_INFINITY;
    return (
      leftCoverage - rightCoverage ||
      right.problemCount - left.problemCount ||
      left.name.localeCompare(right.name)
    );
  });
}

/**
 * Fase 6, corporate multi-plant view (§11). Mirrors CompetenceCorporateBoard
 * exactly — same layout, same sort/tone rules — just fed by
 * FireEquipmentService.getComplianceCoverageByPlant instead of
 * CompetenceService.getAuthorizationCoverageByPlant.
 */
export function FireEquipmentCorporateBoard({
  plants,
  labels = getUiDictionary("en").dashboard,
}: {
  plants: PlantFireEquipmentCoverage[];
  labels?: DashboardUiDictionary;
}) {
  const [showAllPlants, setShowAllPlants] = useState(false);
  const sortedPlants = sortPlantsByCoverage(plants);
  const visiblePlants = showAllPlants ? sortedPlants : sortedPlants.slice(0, TOP_PLANTS_LIMIT);
  const canTogglePlants = sortedPlants.length > TOP_PLANTS_LIMIT;
  const bestCoverage = [...plants]
    .filter((plant) => plant.coveragePercent !== null)
    .sort((left, right) => (right.coveragePercent ?? 0) - (left.coveragePercent ?? 0))[0];
  const mostProblems = [...plants].sort((left, right) => right.problemCount - left.problemCount)[0];

  return (
    <section
      className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.12)]"
      data-testid="fire-equipment-corporate-board"
    >
      <div className="bg-[linear-gradient(135deg,#7c2d12_0%,#b45309_48%,#f59e0b_100%)] p-6 text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
              <Flame className="h-4 w-4" />
              {labels.kpiFireEquipment}
            </div>
            <h2 className="mt-4 text-3xl font-black">{labels.fireEquipmentCoverageAcrossPlants}</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/25 bg-white/15 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/75">{labels.bestFireEquipmentCoverage}</p>
              <p className="mt-1 text-2xl font-black" data-testid="fire-equipment-corporate-best-coverage-value">
                {formatCoverage(bestCoverage?.coveragePercent ?? null, labels.kpiNotApplicable)}
              </p>
              <p className="text-xs text-white/75">{bestCoverage?.name ?? "-"}</p>
            </div>
            <div className="rounded-xl border border-white/25 bg-white/15 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/75">{labels.mostFireEquipmentProblems}</p>
              <p className="mt-1 text-2xl font-black" data-testid="fire-equipment-corporate-most-problems-value">
                {(mostProblems?.problemCount ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-white/75">{mostProblems?.name ?? "-"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
        {visiblePlants.map((plant) => (
          <Link
            key={plant.id}
            href={`/app/${plant.code}/fire-equipment`}
            data-testid="fire-equipment-corporate-plant-card"
            data-plant-code={plant.code}
            className="block rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-amber-300 hover:bg-amber-50/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p data-testid="fire-equipment-corporate-plant-name" className="text-sm font-bold text-slate-900">
                  {plant.name}
                </p>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{plant.code.toUpperCase()}</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                {labels.open}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className={`rounded-lg px-3 py-3 ${getCoverageToneClass(plant.coveragePercent)}`}>
                <p className="text-xs font-semibold uppercase tracking-wide">{labels.kpiFireEquipmentCoverage}</p>
                <p className="text-2xl font-black" data-testid="fire-equipment-corporate-coverage-value">
                  {formatCoverage(plant.coveragePercent, labels.kpiNotApplicable)}
                </p>
              </div>
              <div className={`rounded-lg px-3 py-3 ${getProblemToneClass(plant.problemCount)}`}>
                <p className="text-xs font-semibold uppercase tracking-wide">{labels.kpiFireEquipmentProblems}</p>
                <p className="text-2xl font-black" data-testid="fire-equipment-corporate-problems-value">
                  {plant.problemCount.toLocaleString()}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
      {canTogglePlants ? (
        <div className="px-5 pb-5">
          <button
            type="button"
            aria-expanded={showAllPlants}
            onClick={() => setShowAllPlants((current) => !current)}
            className="inline-flex h-10 items-center justify-center rounded-full border border-amber-200 bg-white px-4 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
          >
            {showAllPlants ? labels.showTopFive : labels.showAllPlants}
          </button>
        </div>
      ) : null}
    </section>
  );
}
