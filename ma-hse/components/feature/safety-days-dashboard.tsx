import { Award, CalendarClock, ShieldCheck, TrendingUp } from "lucide-react";
import { HelpPopover } from "@/components/ui/help-popover";
import type { SafetyDaysSummary } from "@/lib/safety-days";
import { getUiDictionary, type DashboardUiDictionary } from "@/lib/ui-language";

type PlantSafetyDays = {
  id: string;
  code: string;
  name: string;
  safetyDays: SafetyDaysSummary;
};

function formatDate(dateKey: string | null, labels: DashboardUiDictionary) {
  if (!dateKey) return labels.noInjuryRecord;
  return dateKey;
}

function formatLabel(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((label, [key, value]) => label.replace(`{${key}}`, String(value)), template);
}

function ProgressBar({ current, record }: { current: number; record: number }) {
  const percent = record > 0 ? Math.min(100, (current / record) * 100) : 0;

  return (
    <div className="h-2 overflow-hidden rounded-full bg-white/30">
      <div
        className="h-full rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.75)]"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function SafetyDaysSpotlight({
  plantName,
  summary,
  labels = getUiDictionary("en").dashboard,
}: {
  plantName: string;
  summary: SafetyDaysSummary;
  labels?: DashboardUiDictionary;
}) {
  const recordGap = Math.max(0, summary.recordDays - summary.currentDays);
  const historicalRecordLabel = summary.historicalRecordStartDate
    ? formatLabel(labels.historicalRecordSince, { date: summary.historicalRecordStartDate })
    : labels.historicalRecord;

  return (
    <section className="overflow-hidden rounded-2xl border border-teal-100 bg-slate-950 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="relative min-h-[280px] bg-[radial-gradient(circle_at_20%_20%,rgba(45,212,191,0.36),transparent_34%),radial-gradient(circle_at_84%_18%,rgba(251,191,36,0.34),transparent_26%),linear-gradient(135deg,#082f49_0%,#0f172a_48%,#3f1d49_100%)] p-6 sm:p-8">
          <div className="relative z-10 flex h-full flex-col justify-between gap-8">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-50">
                  <ShieldCheck className="h-4 w-4" />
                  {labels.daysWithoutAccidents}
                </div>
                <HelpPopover title={labels.daysWithoutAccidents} body={labels.safetyDaysHelp} buttonLabel={labels.help} />
              </div>
              <h2 className="mt-4 max-w-2xl text-3xl font-black text-white sm:text-4xl">
                {plantName}
              </h2>
            </div>

            <div>
              <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
                <p className="text-7xl font-black leading-none text-white sm:text-8xl">
                  {summary.currentDays.toLocaleString()}
                </p>
                <div className="pb-2">
                  <p className="text-lg font-bold text-teal-50">{labels.currentDays}</p>
                  <p className="text-sm text-white/70">{labels.since} {formatDate(summary.lastAccidentDate, labels)}</p>
                </div>
              </div>
              <div className="mt-5 max-w-xl">
                <ProgressBar current={summary.currentDays} record={summary.recordDays} />
                <div className="mt-2 flex justify-between text-xs font-semibold text-white/75">
                  <span>{labels.current}</span>
                  <span>{formatLabel(labels.recordDays, { days: summary.recordDays.toLocaleString() })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid content-center gap-4 bg-white p-5 text-slate-900 sm:p-6">
          <article className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{labels.current}</p>
                <p className="mt-1 text-4xl font-black text-emerald-900">{summary.currentDays.toLocaleString()}</p>
              </div>
              <ShieldCheck className="h-10 w-10 text-emerald-600" />
            </div>
          </article>

          <article className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{labels.record}</p>
                <p className="mt-1 text-4xl font-black text-amber-900">{summary.recordDays.toLocaleString()}</p>
                {summary.recordSource === "historical" ? (
                  <p className="mt-1 text-xs font-semibold text-amber-800">{historicalRecordLabel}</p>
                ) : null}
              </div>
              <Award className="h-10 w-10 text-amber-600" />
            </div>
          </article>

          <article className="rounded-xl border border-sky-200 bg-sky-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">{labels.toBeatRecord}</p>
                <p className="mt-1 text-3xl font-black text-sky-950">{recordGap.toLocaleString()}</p>
              </div>
              <TrendingUp className="h-9 w-9 text-sky-600" />
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

export function GroupSafetyDaysBoard({
  plants,
  labels = getUiDictionary("en").dashboard,
}: {
  plants: PlantSafetyDays[];
  labels?: DashboardUiDictionary;
}) {
  const bestCurrent = [...plants].sort((left, right) => right.safetyDays.currentDays - left.safetyDays.currentDays)[0];
  const bestRecord = [...plants].sort((left, right) => right.safetyDays.recordDays - left.safetyDays.recordDays)[0];

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
        {plants.map((plant) => (
          <article key={plant.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900">{plant.name}</p>
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
          </article>
        ))}
      </div>
    </section>
  );
}
