"use client";

import Link from "next/link";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { getUiDictionary, type DashboardUiDictionary } from "@/lib/ui-language";

const TOP_PLANTS_LIMIT = 5;

export type PlantCompetenceCoverage = {
  id: string;
  code: string;
  name: string;
  requiredTotal: number;
  validCount: number;
  coveragePercent: number | null;
  expiredCount: number;
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

function getExpiredToneClass(count: number) {
  return count === 0 ? "bg-emerald-100 text-emerald-950" : "bg-rose-100 text-rose-950";
}

function sortPlantsByCoverage(plants: PlantCompetenceCoverage[]) {
  return [...plants].sort((left, right) => {
    const leftCoverage = left.coveragePercent ?? Number.POSITIVE_INFINITY;
    const rightCoverage = right.coveragePercent ?? Number.POSITIVE_INFINITY;
    return (
      leftCoverage - rightCoverage ||
      right.expiredCount - left.expiredCount ||
      left.name.localeCompare(right.name)
    );
  });
}

export function CompetenceCorporateBoard({
  plants,
  labels = getUiDictionary("en").dashboard,
}: {
  plants: PlantCompetenceCoverage[];
  labels?: DashboardUiDictionary;
}) {
  const [showAllPlants, setShowAllPlants] = useState(false);
  const sortedPlants = sortPlantsByCoverage(plants);
  const visiblePlants = showAllPlants ? sortedPlants : sortedPlants.slice(0, TOP_PLANTS_LIMIT);
  const canTogglePlants = sortedPlants.length > TOP_PLANTS_LIMIT;
  const bestCoverage = [...plants]
    .filter((plant) => plant.coveragePercent !== null)
    .sort((left, right) => (right.coveragePercent ?? 0) - (left.coveragePercent ?? 0))[0];
  const mostExpired = [...plants].sort((left, right) => right.expiredCount - left.expiredCount)[0];

  return (
    <section
      className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.12)]"
      data-testid="competence-corporate-board"
    >
      <div className="bg-[linear-gradient(135deg,#062c43_0%,#0f766e_48%,#f59e0b_100%)] p-6 text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
              <ShieldCheck className="h-4 w-4" />
              {labels.kpiCompetenceAuthorizations}
            </div>
            <h2 className="mt-4 text-3xl font-black">{labels.competenceCoverageAcrossPlants}</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/25 bg-white/15 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/75">{labels.bestCompetenceCoverage}</p>
              <p className="mt-1 text-2xl font-black" data-testid="competence-corporate-best-coverage-value">
                {formatCoverage(bestCoverage?.coveragePercent ?? null, labels.kpiNotApplicable)}
              </p>
              <p className="text-xs text-white/75">{bestCoverage?.name ?? "-"}</p>
            </div>
            <div className="rounded-xl border border-white/25 bg-white/15 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/75">{labels.mostExpiredAuthorizations}</p>
              <p className="mt-1 text-2xl font-black" data-testid="competence-corporate-most-expired-value">
                {(mostExpired?.expiredCount ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-white/75">{mostExpired?.name ?? "-"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
        {visiblePlants.map((plant) => (
          <Link
            key={plant.id}
            href={`/app/${plant.code}/competences`}
            data-testid="competence-corporate-plant-card"
            data-plant-code={plant.code}
            className="block rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-teal-300 hover:bg-teal-50/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p data-testid="competence-corporate-plant-name" className="text-sm font-bold text-slate-900">
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
                <p className="text-xs font-semibold uppercase tracking-wide">{labels.kpiCompetenceCoverage}</p>
                <p className="text-2xl font-black" data-testid="competence-corporate-coverage-value">
                  {formatCoverage(plant.coveragePercent, labels.kpiNotApplicable)}
                </p>
              </div>
              <div className={`rounded-lg px-3 py-3 ${getExpiredToneClass(plant.expiredCount)}`}>
                <p className="text-xs font-semibold uppercase tracking-wide">{labels.kpiCompetenceExpired}</p>
                <p className="text-2xl font-black" data-testid="competence-corporate-expired-value">
                  {plant.expiredCount.toLocaleString()}
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
            className="inline-flex h-10 items-center justify-center rounded-full border border-teal-200 bg-white px-4 text-sm font-semibold text-teal-700 transition hover:bg-teal-50"
          >
            {showAllPlants ? labels.showTopFive : labels.showAllPlants}
          </button>
        </div>
      ) : null}
    </section>
  );
}
