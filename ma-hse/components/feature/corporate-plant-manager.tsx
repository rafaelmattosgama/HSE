"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { RoleCode } from "@prisma/client";
import { buttonVariants } from "@/components/ui/button";

type PlantSummary = {
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

type RankingGroup = {
  title: string;
  higherLabel?: string;
  lowerLabel?: string;
  higher: RankingEntry[];
  lower: RankingEntry[];
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
  rankings: RankingGroup[];
};

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
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${valueClassName}`}>{value}</p>
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
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <ol className="mt-3 space-y-2 text-sm">
        {entries.map((entry, index) => {
          const isActive = activePlantCode === entry.plantCode;

          return (
            <li
              key={`${title}-${entry.plantCode}`}
              className={`flex items-center justify-between rounded-md px-2 py-1 ${
                isActive ? "bg-teal-50 text-teal-900" : "text-slate-700"
              }`}
            >
              <span>
                {index + 1}. {entry.plantName}
              </span>
              <span className="font-semibold">{formatValue(entry.value, variant)}</span>
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
  rankings,
}: CorporatePlantManagerProps) {
  const [activePlantCode, setActivePlantCode] = useState<string | null>(null);

  const activePlant = useMemo(
    () => initialPlants.find((plant) => plant.code === activePlantCode) ?? null,
    [activePlantCode, initialPlants],
  );

  const scopeLabel = activePlant ? `${activePlant.name} (${activePlant.code.toUpperCase()})` : "Global";

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <header>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Corporate Indicators</h2>
            <p className="mt-1 text-xs text-slate-600">
              Global values are shown by default. Hover a plant to preview its indicators.
            </p>
          </header>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Scope: {scopeLabel}
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Plants" value={formatValue(activePlant ? 1 : totalPlants, "count")} />
          <MetricCard label="Validated events" value={formatValue(activePlant ? activePlant.validatedEvents : totalValidatedEvents, "count")} />
          <MetricCard label="Open actions" value={formatValue(activePlant ? activePlant.openActions : totalOpenActions, "count")} />
          <MetricCard label="Closed actions" value={formatValue(activePlant ? activePlant.closedActions : totalClosedActions, "count")} tone="success" />
          <MetricCard label="Actions to close" value={formatValue(activePlant ? activePlant.actionsToClose : totalActionsToClose, "count")} tone="danger" />
          <MetricCard label="% closed actions" value={formatValue(activePlant ? activePlant.closedActionsPercent : totalClosedActionsPercent, "percent")} />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="% actions to close" value={formatValue(activePlant ? activePlant.actionsToClosePercent : totalActionsToClosePercent, "percent")} />
          <MetricCard label="Near misses" value={formatValue(activePlant ? activePlant.nearMissCount : totalNearMisses, "count")} />
          <MetricCard label="Injuries" value={formatValue(activePlant ? activePlant.injuryCount : totalInjuries, "count")} />
          <MetricCard label="Frequency index" value={formatValue(activePlant ? activePlant.frequencyIndex : totalFrequencyIndex, "index")} />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <MetricCard label="Severity index" value={formatValue(activePlant ? activePlant.severityIndex : totalSeverityIndex, "index")} />
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Preview help</p>
            <p className="mt-2 text-sm text-slate-700">
              Pass the cursor over a plant card below to switch these cards from global corporate values to plant-specific values.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <header>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Top 5 Plants</h2>
          <p className="mt-1 text-xs text-slate-600">Global comparison across all plants for the indicators requested.</p>
        </header>

        <div className="mt-4 space-y-4">
          {rankings.map((group) => (
            <section key={group.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-900">{group.title}</h3>
              <div className="mt-3 grid gap-4 xl:grid-cols-2">
                {group.higherLabel ? (
                  <RankingCard title={group.higherLabel} entries={group.higher} activePlantCode={activePlantCode} variant={group.title.includes("index") ? "index" : "count"} />
                ) : null}
                {group.lowerLabel ? (
                  <RankingCard title={group.lowerLabel} entries={group.lower} activePlantCode={activePlantCode} variant={group.title.includes("index") ? "index" : "count"} />
                ) : null}
                {!group.lowerLabel ? (
                  <RankingCard title={group.higherLabel ?? group.title} entries={group.higher} activePlantCode={activePlantCode} variant="count" />
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        onMouseLeave={() => setActivePlantCode(null)}
      >
        <header>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Corporate Plants</h2>
          <p className="mt-1 text-xs text-slate-600">Browse all plants first. Use the button below to open the plant creation page.</p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          {initialPlants.map((plant) => (
            <Link
              key={plant.id}
              href={`/app/${plant.code}/dashboards`}
              className={`block rounded-lg border p-4 transition ${
                activePlantCode === plant.code
                  ? "border-teal-400 bg-teal-50"
                  : "border-slate-200 hover:border-teal-300 hover:bg-teal-50/40"
              }`}
              onMouseEnter={() => setActivePlantCode(plant.code)}
              onFocus={() => setActivePlantCode(plant.code)}
              onBlur={() => setActivePlantCode(null)}
            >
              <article>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{plant.name}</p>
                    <p className="text-xs text-slate-500">
                      {plant.code.toUpperCase()} - {plant.timezone} - {plant.defaultLanguage.toUpperCase()}
                    </p>
                  </div>
                  <span className={buttonVariants({ variant: "secondary", size: "sm" })}>Abrir planta</span>
                </div>
                <p className="mt-2 text-sm text-slate-700">Near misses: {plant.nearMissCount}</p>
                <p className="text-sm text-slate-700">Injuries: {plant.injuryCount}</p>
                <p className="text-sm text-slate-700">Actions to close: {plant.actionsToClose}</p>
                <div className="mt-3 space-y-1 text-xs text-slate-600">
                  {plant.leaders.map((leader) => (
                    <p key={`${plant.id}-${leader.role}`}>
                      {leader.role}: {leader.name} ({leader.email ?? "-"})
                    </p>
                  ))}
                </div>
              </article>
            </Link>
          ))}
        </div>

        <div>
          <Link href="/app/corporate/plants/new" className={buttonVariants({ size: "sm" })}>
            Criar planta
          </Link>
        </div>
      </section>
    </div>
  );
}
