import Link from "next/link";
import { RoleCode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { getLocale } from "next-intl/server";
import { authOptions } from "@/lib/auth/options";
import { resolveDashboardPeriod, type DashboardSearchParams } from "@/lib/dashboard-period";
import { prisma } from "@/lib/prisma";
import { CommunicationPyramid } from "@/components/feature/communication-pyramid";
import { CorporatePlantManager, type RankingGroup } from "@/components/feature/corporate-plant-manager";
import { LanguageSelector } from "@/components/feature/language-selector";
import { getUiDictionary } from "@/lib/ui-language";

function buildPyramidCounts(
  rows: Array<{
    type: string;
    classification: string | null;
  }>,
) {
  return {
    unsafeAct: rows.filter((entry) => entry.type === "UNSAFE_ACT").length,
    unsafeCondition: rows.filter((entry) => entry.type === "UNSAFE_CONDITION").length,
    nearMiss: rows.filter((entry) => entry.type === "NEAR_MISS").length,
    firstAid: rows.filter((entry) => entry.type === "FIRST_AID").length,
    minorInjury: rows.filter((entry) => entry.type === "ACCIDENT" && entry.classification === "MINOR").length,
    seriousInjury: rows.filter((entry) => entry.type === "ACCIDENT" && entry.classification === "SERIOUS").length,
    fatal: rows.filter((entry) => entry.type === "ACCIDENT" && entry.classification === "FATAL").length,
  };
}

function buildMonthlyInputFilter(period: ReturnType<typeof resolveDashboardPeriod>) {
  const pairs: Array<{ year: number; month: number }> = [];
  const cursor = new Date(Date.UTC(period.from.getUTCFullYear(), period.from.getUTCMonth(), 1));
  const last = new Date(Date.UTC(period.to.getUTCFullYear(), period.to.getUTCMonth(), 1));

  while (cursor <= last) {
    pairs.push({
      year: cursor.getUTCFullYear(),
      month: cursor.getUTCMonth() + 1,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return {
    OR: pairs.map((pair) => ({ year: pair.year, month: pair.month })),
  };
}

function buildTopEntries(map: Map<string, number>) {
  return [...map.entries()]
    .map(([label, value], index) => ({
      plantCode: `rank-${index}-${label}`,
      plantName: label,
      value,
    }))
    .sort((a, b) => b.value - a.value || a.plantName.localeCompare(b.plantName))
    .slice(0, 5);
}

function increment(map: Map<string, number>, label: string | null | undefined) {
  const normalized = label?.trim();
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) ?? 0) + 1);
}

function buildYearOptions(input: {
  currentYear: number;
  communicationMin?: Date | null;
  communicationMax?: Date | null;
  monthlyMinYear?: number | null;
  monthlyMaxYear?: number | null;
}) {
  const candidates = [
    input.currentYear,
    input.communicationMin?.getUTCFullYear(),
    input.communicationMax?.getUTCFullYear(),
    input.monthlyMinYear,
    input.monthlyMaxYear,
  ].filter((value): value is number => Number.isFinite(value));

  const minYear = Math.min(...candidates, input.currentYear - 5);
  const maxYear = Math.max(...candidates, input.currentYear);
  const years: number[] = [];

  for (let year = maxYear; year >= minYear; year -= 1) {
    years.push(year);
  }

  return years;
}

export default async function DashboardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ plant: string }>;
  searchParams: Promise<DashboardSearchParams>;
}) {
  const { plant } = await params;
  const currentSearchParams = await searchParams;
  const session = await getServerSession(authOptions);
  const locale = await getLocale();
  const ui = getUiDictionary(locale);
  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });
  const actorRole = session?.user.plantRoles.some((entry) => entry.role === RoleCode.N0_ADMIN)
    ? RoleCode.N0_ADMIN
    : session?.user.plantRoles.some((entry) => entry.role === RoleCode.N1_CORPORATE)
      ? RoleCode.N1_CORPORATE
      : session?.user.plantRoles.find((entry) => entry.plantCode === plant)?.role;
  const period = resolveDashboardPeriod(currentSearchParams);

  const [communicationRows, actionRows, hoursWorkedRows, employeeRows, communicationDateRange, monthlyYearRange] = await prisma.$transaction([
    prisma.communication.findMany({
      where: {
        plantId: plantRow.id,
        eventDatetime: {
          gte: period.from,
          lte: period.to,
        },
      },
      select: {
        type: true,
        status: true,
        lostDays: true,
        classification: true,
        reporterName: true,
        reporterEmployeeNo: true,
        targetText: true,
        targetEmployee: {
          select: {
            name: true,
            dept: true,
          },
        },
        workstation: {
          select: {
            name: true,
          },
        },
      },
    }),
    prisma.action.findMany({
      where: {
        plantId: plantRow.id,
        createdAt: {
          gte: period.from,
          lte: period.to,
        },
      },
      select: {
        status: true,
        dueDate: true,
        createdAt: true,
        ownerUserId: true,
      },
    }),
    prisma.plantMonthlyInput.findMany({
      where: {
        plantId: plantRow.id,
        ...buildMonthlyInputFilter(period),
      },
      select: {
        hoursWorked: true,
      },
    }),
    prisma.employeeDirectory.findMany({
      where: {
        plantId: plantRow.id,
      },
      select: {
        employeeNo: true,
        name: true,
        dept: true,
      },
    }),
    prisma.communication.aggregate({
      where: { plantId: plantRow.id },
      _min: { eventDatetime: true },
      _max: { eventDatetime: true },
    }),
    prisma.plantMonthlyInput.aggregate({
      where: { plantId: plantRow.id },
      _min: { year: true },
      _max: { year: true },
    }),
  ]);

  const employeeByNo = new Map(employeeRows.map((entry) => [entry.employeeNo, entry]));
  const validCommunications = communicationRows.filter((entry) => ["VALID_OPEN", "ONGOING", "CLOSED"].includes(entry.status));
  const pyramidCounts = buildPyramidCounts(validCommunications);
  const pendingValidation = communicationRows.filter((entry) => ["SUBMITTED", "PENDING_VALIDATION"].includes(entry.status)).length;
  const openCommunications = communicationRows.filter((entry) => ["VALID_OPEN", "ONGOING"].includes(entry.status)).length;
  const myOpenActions = actionRows.filter(
    (entry) => entry.ownerUserId === session?.user.id && (entry.status === "OPEN" || entry.status === "ONGOING"),
  ).length;
  const clinicalCases = communicationRows.filter((entry) => entry.type === "FIRST_AID" || entry.type === "ACCIDENT").length;
  const overdue = actionRows.filter(
    (entry) => (entry.status === "OPEN" || entry.status === "ONGOING") && entry.dueDate.getTime() < period.to.getTime(),
  ).length;
  const openActionsCount = actionRows.filter((entry) => entry.status === "OPEN").length;
  const closedActions = actionRows.filter((entry) => entry.status === "CLOSED").length;
  const actionsToClose = actionRows.filter((entry) => entry.status === "OPEN" || entry.status === "ONGOING").length;
  const totalActions = actionRows.length;
  const validCommunicationsCount = validCommunications.length;
  const nearMissCount = validCommunications.filter((entry) => entry.type === "NEAR_MISS").length;
  const injuryCount = validCommunications.filter((entry) => entry.type === "ACCIDENT").length;
  const lostDays = validCommunications.reduce((sum, entry) => sum + (entry.lostDays ?? 0), 0);
  const closedActionsPercent = totalActions > 0 ? (closedActions / totalActions) * 100 : 0;
  const actionsToClosePercent = totalActions > 0 ? (actionsToClose / totalActions) * 100 : 0;
  const totalHoursWorked = hoursWorkedRows.reduce((sum, entry) => sum + Number(entry.hoursWorked ?? 0), 0);
  const frequencyIndex = totalHoursWorked > 0 ? (injuryCount / totalHoursWorked) * 1_000_000 : 0;
  const severityIndex = totalHoursWorked > 0 ? (lostDays / totalHoursWorked) * 1_000_000 : 0;

  const involvedWorkers = new Map<string, number>();
  const reportingWorkers = new Map<string, number>();
  const involvedDepartments = new Map<string, number>();
  const reportingDepartments = new Map<string, number>();
  const involvedLocations = new Map<string, number>();

  for (const row of validCommunications) {
    increment(involvedWorkers, row.targetEmployee?.name ?? row.targetText);
    if (row.reporterEmployeeNo) {
      const reporterEmployee = employeeByNo.get(row.reporterEmployeeNo);
      increment(reportingWorkers, reporterEmployee ? `${reporterEmployee.employeeNo} - ${reporterEmployee.name}` : row.reporterEmployeeNo);
    }
    increment(involvedDepartments, row.targetEmployee?.dept);
    increment(involvedLocations, row.workstation?.name);

    const reporterEmployee = row.reporterEmployeeNo ? employeeByNo.get(row.reporterEmployeeNo) : null;
    increment(reportingDepartments, reporterEmployee?.dept);
  }

  const rankings: RankingGroup[] = [
    {
      id: "workers-involved",
      title: "Workers involved in communications",
      variant: "count",
      higher: buildTopEntries(involvedWorkers),
      lower: [],
    },
    {
      id: "workers-reporting",
      title: "Workers with more communications submitted",
      variant: "count",
      higher: buildTopEntries(reportingWorkers),
      lower: [],
    },
    {
      id: "departments-involved",
      title: "Departments involved in communications",
      variant: "count",
      higher: buildTopEntries(involvedDepartments),
      lower: [],
    },
    {
      id: "departments-reporting",
      title: "Departments with more communications submitted",
      variant: "count",
      higher: buildTopEntries(reportingDepartments),
      lower: [],
    },
    {
      id: "locations-involved",
      title: "Workstations with more communications",
      variant: "count",
      higher: buildTopEntries(involvedLocations),
      lower: [],
    },
  ];

  const plantBenchmarkSummary = {
    id: plantRow.id,
    code: plantRow.code,
    name: plantRow.name,
    timezone: plantRow.timezone,
    defaultLanguage: plantRow.defaultLanguage,
    validatedEvents: validCommunicationsCount,
    openActions: openActionsCount,
    closedActions,
    actionsToClose,
    closedActionsPercent,
    actionsToClosePercent,
    nearMissCount,
    injuryCount,
    frequencyIndex,
    severityIndex,
    communicationPyramid: pyramidCounts,
    leaders: [],
  };
  const yearOptions = buildYearOptions({
    currentYear: new Date().getUTCFullYear(),
    communicationMin: communicationDateRange._min.eventDatetime,
    communicationMax: communicationDateRange._max.eventDatetime,
    monthlyMinYear: monthlyYearRange._min.year,
    monthlyMaxYear: monthlyYearRange._max.year,
  });
  const monthOptions = [
    { value: "1", label: "01 - January" },
    { value: "2", label: "02 - February" },
    { value: "3", label: "03 - March" },
    { value: "4", label: "04 - April" },
    { value: "5", label: "05 - May" },
    { value: "6", label: "06 - June" },
    { value: "7", label: "07 - July" },
    { value: "8", label: "08 - August" },
    { value: "9", label: "09 - September" },
    { value: "10", label: "10 - October" },
    { value: "11", label: "11 - November" },
    { value: "12", label: "12 - December" },
  ];

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{ui.dashboard.plantTitle}</h1>
            <p className="mt-1 text-sm text-slate-600">{ui.dashboard.plantDescription}</p>
          </div>
          <LanguageSelector currentLocale={locale} label={ui.dashboard.language} />
        </div>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <form className="grid gap-3 md:grid-cols-5">
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.dashboard.year}</span>
            <select name="year" defaultValue={String(period.year)} className="w-full rounded-md border border-slate-300 px-3 py-2">
              {yearOptions.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.dashboard.month}</span>
            <select name="month" defaultValue={period.month ? String(period.month) : ""} className="w-full rounded-md border border-slate-300 px-3 py-2">
              <option value="">All months</option>
              {monthOptions.map((month) => (
                <option key={month.value} value={month.value}>{month.label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.dashboard.from}</span>
            <input type="date" name="from" defaultValue={period.mode === "range" ? period.from.toISOString().slice(0, 10) : ""} className="w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.dashboard.to}</span>
            <input type="date" name="to" defaultValue={period.mode === "range" ? period.to.toISOString().slice(0, 10) : ""} className="w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <div className="flex items-end gap-2">
            <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white">{ui.dashboard.apply}</button>
            <Link href={`/app/${plant}/dashboards`} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">Clear dates</Link>
            <Link href={`/app/${plant}/dashboards`} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">{ui.dashboard.currentYear}</Link>
          </div>
        </form>
      </section>

      <section className="grid gap-4 md:grid-cols-5">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Period</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">{period.label}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Validated events</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{validCommunicationsCount}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Hours worked</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{totalHoursWorked.toFixed(2)}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Overdue actions</p>
          <p className="mt-2 text-2xl font-bold text-red-700">{overdue}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">My open actions</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{myOpenActions}</p>
        </article>
      </section>

      {actorRole === RoleCode.N0_ADMIN || actorRole === RoleCode.N1_CORPORATE || actorRole === RoleCode.N2_PLANT_MANAGER ? (
        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Open communications</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{openCommunications}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Pending validation</p>
            <p className="mt-2 text-2xl font-bold text-amber-700">{pendingValidation}</p>
          </article>
        </section>
      ) : null}

      {actorRole === RoleCode.N3_SAFETY ? (
        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Pending validation</p>
            <p className="mt-2 text-2xl font-bold text-amber-700">{pendingValidation}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Open communications</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{openCommunications}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Clinical cases</p>
            <p className="mt-2 text-2xl font-bold text-rose-700">{clinicalCases}</p>
          </article>
        </section>
      ) : null}

      {actorRole === RoleCode.N4_SUPERVISOR || actorRole === RoleCode.N5_OPERATOR ? (
        <section className="grid gap-4 md:grid-cols-1">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Open communications</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{openCommunications}</p>
          </article>
        </section>
      ) : null}

      <CommunicationPyramid
        title="Safety Communication Pyramid"
        description="Only one pyramid is shown here, always recalculated for the selected period."
        counts={pyramidCounts}
      />

      {(actorRole === RoleCode.N0_ADMIN ||
        actorRole === RoleCode.N1_CORPORATE ||
        actorRole === RoleCode.N2_PLANT_MANAGER ||
        actorRole === RoleCode.N3_SAFETY) ? (
        <CorporatePlantManager
          initialPlants={[plantBenchmarkSummary]}
          totalPlants={1}
          totalValidatedEvents={plantBenchmarkSummary.validatedEvents}
          totalOpenActions={plantBenchmarkSummary.openActions}
          totalClosedActions={plantBenchmarkSummary.closedActions}
          totalActionsToClose={plantBenchmarkSummary.actionsToClose}
          totalClosedActionsPercent={plantBenchmarkSummary.closedActionsPercent}
          totalActionsToClosePercent={plantBenchmarkSummary.actionsToClosePercent}
          totalNearMisses={plantBenchmarkSummary.nearMissCount}
          totalInjuries={plantBenchmarkSummary.injuryCount}
          totalFrequencyIndex={plantBenchmarkSummary.frequencyIndex}
          totalSeverityIndex={plantBenchmarkSummary.severityIndex}
          totalCommunicationPyramid={plantBenchmarkSummary.communicationPyramid}
          rankings={rankings}
          title="Plant Indicators"
          description="Corporate-style indicators filtered to this plant only."
          favoriteMetricsDescription="Choose the cards that should appear by default for this plant."
          favoriteRankingsDescription="Safety Ranking with the same visual language as the corporate rankings."
          pyramidDescription="Communication totals for this plant only."
          storageKeyBase={`ma-hse-plant-${plantRow.code}`}
          initialActivePlantCode={plantRow.code}
          hidePlantList
          hidePyramid
          showCreatePlantLink={false}
        />
      ) : null}
    </>
  );
}
