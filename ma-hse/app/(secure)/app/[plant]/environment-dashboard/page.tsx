import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { getServerUiDictionary } from "@/lib/server-ui-language";
import { EnvironmentDashboardBoard } from "@/components/feature/environment-dashboard-board";
import { buildEnvironmentDashboardPlant } from "@/lib/environment-dashboard";
import { resolveDashboardPeriod, type DashboardSearchParams } from "@/lib/dashboard-period";
import { buildMonthBuckets } from "@/lib/dashboard-visualization";

function readParam(searchParams: DashboardSearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function hasDateFilter(searchParams: DashboardSearchParams) {
  return Boolean(
    readParam(searchParams, "year") ||
      readParam(searchParams, "month") ||
      readParam(searchParams, "from") ||
      readParam(searchParams, "to"),
  );
}

function resolveDefaultEnvironmentPeriod(latestRow: { year: number; month: number } | null, now = new Date()) {
  const year = latestRow?.year ?? now.getUTCFullYear();
  const month = latestRow?.month ?? 12;
  const from = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  return {
    label: latestRow ? `${from.toISOString().slice(0, 10)} - ${to.toISOString().slice(0, 10)}` : "No monthly input data",
    from,
    to,
    year,
    month: null as number | null,
    mode: "default" as const,
  };
}

function buildMonthlyInputFilter(buckets: Array<{ year: number; month: number }>) {
  if (buckets.length === 0) {
    return { year: -1 };
  }

  return {
    OR: buckets.map((bucket) => ({ year: bucket.year, month: bucket.month })),
  };
}

function previousYearBuckets(buckets: Array<{ year: number; month: number }>) {
  return buckets.map((bucket) => ({
    year: bucket.year - 1,
    month: bucket.month,
  }));
}

function buildYearOptions(input: { currentYear: number; minYear?: number | null; maxYear?: number | null }) {
  const candidates = [input.currentYear, input.minYear, input.maxYear].filter((value): value is number => Number.isFinite(value));
  const minYear = Math.min(...candidates, input.currentYear - 5);
  const maxYear = Math.max(...candidates, input.currentYear);
  const years: number[] = [];

  for (let year = maxYear; year >= minYear; year -= 1) {
    years.push(year);
  }

  return years;
}

function getMonthLabel(locale: string, monthIndex: number) {
  const monthName = new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(Date.UTC(2024, monthIndex, 1)));
  const localizedName = `${monthName.slice(0, 1).toLocaleUpperCase(locale)}${monthName.slice(1)}`;
  return `${String(monthIndex + 1).padStart(2, "0")} - ${localizedName}`;
}

export default async function EnvironmentDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ plant: string }>;
  searchParams: Promise<DashboardSearchParams>;
}) {
  const { plant } = await params;
  const currentSearchParams = await searchParams;
  const session = await getServerSession(authOptions);
  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });
  const ui = await getServerUiDictionary({
    userLanguage: session?.user.language,
    plantLanguage: plantRow.defaultLanguage,
  });
  const filterApplied = hasDateFilter(currentSearchParams);
  const [latestInputRow, monthlyYearRange] = await prisma.$transaction([
    prisma.plantMonthlyInput.findFirst({
      where: { plantId: plantRow.id },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      select: { year: true, month: true },
    }),
    prisma.plantMonthlyInput.aggregate({
      where: { plantId: plantRow.id },
      _min: { year: true },
      _max: { year: true },
    }),
  ]);
  const period = filterApplied ? resolveDashboardPeriod(currentSearchParams) : resolveDefaultEnvironmentPeriod(latestInputRow);
  const monthBuckets = buildMonthBuckets(period.from, period.to);
  const monthlyInputFilter = buildMonthlyInputFilter(monthBuckets);
  const previousMonthlyInputFilter = buildMonthlyInputFilter(previousYearBuckets(monthBuckets));
  const [rows, previousRows] = await prisma.$transaction([
    prisma.plantMonthlyInput.findMany({
      where: {
        plantId: plantRow.id,
        ...monthlyInputFilter,
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
    prisma.plantMonthlyInput.findMany({
      where: {
        plantId: plantRow.id,
        ...previousMonthlyInputFilter,
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
  ]);
  const orderedRows = [...rows].sort((left, right) => {
    if (left.year !== right.year) {
      return left.year - right.year;
    }

    return left.month - right.month;
  });
  const orderedPreviousRows = [...previousRows].sort((left, right) => {
    if (left.year !== right.year) {
      return left.year - right.year;
    }

    return left.month - right.month;
  });
  const environmentPlant = buildEnvironmentDashboardPlant({
    id: plantRow.id,
    code: plantRow.code,
    name: plantRow.name,
    rows: orderedRows,
  });
  const previousEnvironmentPlant = buildEnvironmentDashboardPlant({
    id: plantRow.id,
    code: plantRow.code,
    name: plantRow.name,
    rows: orderedPreviousRows,
  });
  const currentYear = new Date().getUTCFullYear();
  const yearOptions = buildYearOptions({
    currentYear,
    minYear: monthlyYearRange._min.year,
    maxYear: monthlyYearRange._max.year,
  });
  const monthOptions = Array.from({ length: 12 }, (_, index) => ({
    value: String(index + 1),
    label: getMonthLabel(session?.user.language ?? plantRow.defaultLanguage ?? "en", index),
  }));

  return (
    <>
      <header className="app-hero rounded-2xl p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Environment dashboard</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{ui.modules.environmentDashboard}</h1>
            <p className="mt-2 text-sm text-slate-600">
              Visual overview of monthly environmental indicators for {plantRow.name}.
            </p>
          </div>
          <Link href={`/app/${plant}/monthly-inputs`} className="app-toolbar h-11 whitespace-nowrap px-4 text-emerald-800">
            Update monthly inputs
          </Link>
        </div>
      </header>

      <section className="app-panel rounded-2xl p-5">
        <form className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="space-y-1.5 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{ui.dashboard.year}</span>
            <select
              name="year"
              defaultValue={String(period.year)}
              className="h-11 w-full rounded-[10px] border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition focus:border-slate-400"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{ui.dashboard.month}</span>
            <select
              name="month"
              defaultValue={period.month ? String(period.month) : ""}
              className="h-11 w-full rounded-[10px] border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition focus:border-slate-400"
            >
              <option value="">{ui.dashboard.allMonths}</option>
              {monthOptions.map((month) => (
                <option key={month.value} value={month.value}>{month.label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{ui.dashboard.from}</span>
            <input
              type="date"
              name="from"
              defaultValue={period.mode === "range" ? period.from.toISOString().slice(0, 10) : ""}
              className="h-11 w-full rounded-[10px] border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition focus:border-slate-400"
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{ui.dashboard.to}</span>
            <input
              type="date"
              name="to"
              defaultValue={period.mode === "range" ? period.to.toISOString().slice(0, 10) : ""}
              className="h-11 w-full rounded-[10px] border border-slate-300 bg-white px-3 py-2 text-[15px] text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition focus:border-slate-400"
            />
          </label>
          <div className="flex flex-wrap items-end gap-2 xl:justify-end">
            <button
              type="submit"
              className="inline-flex h-11 min-w-[108px] items-center justify-center whitespace-nowrap rounded-[10px] bg-slate-900 px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(6,26,82,0.14)] transition hover:opacity-95"
            >
              {ui.dashboard.apply}
            </button>
            <Link href={`/app/${plant}/environment-dashboard`} className="app-toolbar h-11 min-w-[118px] whitespace-nowrap px-4">
              {ui.dashboard.clearDates}
            </Link>
            <Link href={`/app/${plant}/environment-dashboard?year=${currentYear}`} className="app-toolbar h-11 min-w-[108px] whitespace-nowrap px-4">
              {ui.dashboard.currentYear}
            </Link>
          </div>
        </form>
      </section>

      <EnvironmentDashboardBoard
        title={ui.modules.environmentDashboard}
        scopeLabel={plantRow.name}
        periodLabel={period.label}
        plants={[environmentPlant]}
        comparisonPlants={[previousEnvironmentPlant]}
        isDefaultPeriod={!filterApplied}
        periodMonthsCount={monthBuckets.length}
        storageKeyBase={`ma-hse-environment-${plantRow.code}`}
      />
    </>
  );
}
