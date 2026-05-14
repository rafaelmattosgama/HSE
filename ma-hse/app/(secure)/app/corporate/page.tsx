import { CommunicationStatus, RoleCode } from "@prisma/client";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { getLocale } from "next-intl/server";
import { formatActionCode } from "@/lib/helpers";
import { authOptions } from "@/lib/auth/options";
import { resolveDashboardPeriod, type DashboardSearchParams } from "@/lib/dashboard-period";
import { prisma } from "@/lib/prisma";
import { CorporatePlantManager, type RankingGroup } from "@/components/feature/corporate-plant-manager";
import { CorporateActionPlans } from "@/components/feature/corporate-action-plans";
import { LanguageSelector } from "@/components/feature/language-selector";
import { RepeatabilityAlertEditor } from "@/components/feature/repeatability-alert-editor";
import { getGlobalRepeatabilityAlertConfig } from "@/lib/services/parameter-service";
import { getUiDictionary } from "@/lib/ui-language";

const KPI_COMMUNICATION_STATUSES: CommunicationStatus[] = [
  CommunicationStatus.VALID_OPEN,
  CommunicationStatus.ONGOING,
  CommunicationStatus.CLOSED,
];
const ONE_MILLION = 1_000_000;

function buildTopFive(
  plants: Array<{
    code: string;
    name: string;
    value: number;
  }>,
) {
  const higher = [...plants].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)).slice(0, 5);
  const lower = [...plants].sort((a, b) => a.value - b.value || a.name.localeCompare(b.name)).slice(0, 5);

  return {
    higher: higher.map((entry) => ({ plantCode: entry.code, plantName: entry.name, value: entry.value })),
    lower: lower.map((entry) => ({ plantCode: entry.code, plantName: entry.name, value: entry.value })),
  };
}

export default async function CorporatePage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const session = await getServerSession(authOptions);
  const locale = await getLocale();
  const ui = getUiDictionary(locale);
  const period = resolveDashboardPeriod(await searchParams);
  const defaultPlantRole = session?.user.plantRoles.find(
    (entry) =>
      entry.role === RoleCode.N2_PLANT_MANAGER ||
      entry.role === RoleCode.N3_SAFETY ||
      entry.role === RoleCode.N4_SUPERVISOR ||
      entry.role === RoleCode.N5_OPERATOR,
  );

  const [plants, corporateActions, globalRepeatabilityConfig] = await Promise.all([
    prisma.plant.findMany({
      include: {
        communications: {
          where: {
            eventDatetime: {
              gte: period.from,
              lte: period.to,
            },
          },
          select: {
            id: true,
            type: true,
            lostDays: true,
            status: true,
            classification: true,
          },
        },
        actions: {
          select: {
            id: true,
            status: true,
          },
        },
        kpiInputs: {
          where: {
            year: period.year,
            month: period.month ?? undefined,
          },
        },
        users: {
          where: {
            role: {
              code: {
                in: [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY],
              },
            },
          },
          include: {
            role: true,
            user: true,
          },
        },
      },
    }),
    prisma.action.findMany({
      include: {
        plant: true,
        ownerUser: true,
        evidenceAttachments: true,
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    }),
    getGlobalRepeatabilityAlertConfig(),
  ]);
  const canManageGlobalRepeatability = session?.user.plantRoles.some(
    (entry) => entry.role === RoleCode.N0_ADMIN || entry.role === RoleCode.N1_CORPORATE,
  );

  const plantSummaries = plants.map((plant) => {
    const validCommunications = plant.communications.filter((entry) => KPI_COMMUNICATION_STATUSES.includes(entry.status));
    const nearMissCount = validCommunications.filter((entry) => entry.type === "NEAR_MISS").length;
    const injuryCount = validCommunications.filter((entry) => entry.type === "ACCIDENT").length;
    const lostDays = validCommunications.reduce((sum, entry) => sum + (entry.lostDays ?? 0), 0);
    const hoursWorked = plant.kpiInputs.reduce((sum, entry) => sum + Number(entry.hoursWorked ?? 0), 0);
    const openActions = plant.actions.filter((entry) => entry.status === "OPEN").length;
    const closedActions = plant.actions.filter((entry) => entry.status === "CLOSED").length;
    const actionsToClose = plant.actions.filter((entry) => entry.status === "OPEN" || entry.status === "ONGOING").length;
    const totalActions = plant.actions.length;
    const closedActionsPercent = totalActions > 0 ? (closedActions / totalActions) * 100 : 0;
    const actionsToClosePercent = totalActions > 0 ? (actionsToClose / totalActions) * 100 : 0;
    const frequencyIndex = hoursWorked > 0 ? (injuryCount / hoursWorked) * ONE_MILLION : 0;
    const severityIndex = hoursWorked > 0 ? (lostDays / hoursWorked) * ONE_MILLION : 0;

    return {
      id: plant.id,
      code: plant.code,
      name: plant.name,
      timezone: plant.timezone,
      defaultLanguage: plant.defaultLanguage,
      validatedEvents: plant.communications.length,
      openActions,
      closedActions,
      actionsToClose,
      closedActionsPercent,
      actionsToClosePercent,
      nearMissCount,
      injuryCount,
      frequencyIndex,
      severityIndex,
      communicationPyramid: {
        unsafeAct: plant.communications.filter((entry) => entry.type === "UNSAFE_ACT").length,
        unsafeCondition: plant.communications.filter((entry) => entry.type === "UNSAFE_CONDITION").length,
        nearMiss: plant.communications.filter((entry) => entry.type === "NEAR_MISS").length,
        firstAid: plant.communications.filter((entry) => entry.type === "FIRST_AID").length,
        minorInjury: plant.communications.filter((entry) => entry.type === "ACCIDENT" && entry.classification === "MINOR").length,
        seriousInjury: plant.communications.filter((entry) => entry.type === "ACCIDENT" && entry.classification === "SERIOUS").length,
        fatal: plant.communications.filter((entry) => entry.type === "ACCIDENT" && entry.classification === "FATAL").length,
      },
      leaders: plant.users
        .map((entry) => ({
          role: entry.role.code,
          email: entry.user.email,
          name: entry.user.name,
        }))
        .sort((a, b) => a.role.localeCompare(b.role)),
    };
  });

  const totalValidatedEvents = plantSummaries.reduce((sum, plant) => sum + plant.validatedEvents, 0);
  const totalOpenActions = plantSummaries.reduce((sum, plant) => sum + plant.openActions, 0);
  const totalClosedActions = plantSummaries.reduce((sum, plant) => sum + plant.closedActions, 0);
  const totalActionsToClose = plantSummaries.reduce((sum, plant) => sum + plant.actionsToClose, 0);
  const totalNearMisses = plantSummaries.reduce((sum, plant) => sum + plant.nearMissCount, 0);
  const totalInjuries = plantSummaries.reduce((sum, plant) => sum + plant.injuryCount, 0);
  const totalHoursWorked = plants.reduce((sum, plant) => sum + plant.kpiInputs.reduce((innerSum, entry) => innerSum + Number(entry.hoursWorked ?? 0), 0), 0);
  const totalLostDays = plants.reduce((sum, plant) => {
    const validCommunications = plant.communications.filter((entry) => KPI_COMMUNICATION_STATUSES.includes(entry.status));
    return sum + validCommunications.reduce((innerSum, entry) => innerSum + (entry.lostDays ?? 0), 0);
  }, 0);
  const totalActionPool = totalOpenActions + totalClosedActions + plantSummaries.reduce((sum, plant) => sum + (plant.actionsToClose - plant.openActions), 0);
  const totalClosedActionsPercent = totalActionPool > 0 ? (totalClosedActions / totalActionPool) * 100 : 0;
  const totalActionsToClosePercent = totalActionPool > 0 ? (totalActionsToClose / totalActionPool) * 100 : 0;
  const totalFrequencyIndex = totalHoursWorked > 0 ? (totalInjuries / totalHoursWorked) * ONE_MILLION : 0;
  const totalSeverityIndex = totalHoursWorked > 0 ? (totalLostDays / totalHoursWorked) * ONE_MILLION : 0;
  const totalCommunicationPyramid = {
    unsafeAct: plantSummaries.reduce((sum, plant) => sum + plant.communicationPyramid.unsafeAct, 0),
    unsafeCondition: plantSummaries.reduce((sum, plant) => sum + plant.communicationPyramid.unsafeCondition, 0),
    nearMiss: plantSummaries.reduce((sum, plant) => sum + plant.communicationPyramid.nearMiss, 0),
    firstAid: plantSummaries.reduce((sum, plant) => sum + plant.communicationPyramid.firstAid, 0),
    minorInjury: plantSummaries.reduce((sum, plant) => sum + plant.communicationPyramid.minorInjury, 0),
    seriousInjury: plantSummaries.reduce((sum, plant) => sum + plant.communicationPyramid.seriousInjury, 0),
    fatal: plantSummaries.reduce((sum, plant) => sum + plant.communicationPyramid.fatal, 0),
  };

  const rankings: RankingGroup[] = [
    {
      id: "nearMisses",
      title: "Near misses",
      variant: "count",
      higherLabel: "Higher number of near misses",
      lowerLabel: "Lower number of near misses",
      ...buildTopFive(plantSummaries.map((plant) => ({ code: plant.code, name: plant.name, value: plant.nearMissCount }))),
    },
    {
      id: "injuries",
      title: "Injuries",
      variant: "count",
      higherLabel: "Higher number of injuries",
      lowerLabel: "Lower number of injuries",
      ...buildTopFive(plantSummaries.map((plant) => ({ code: plant.code, name: plant.name, value: plant.injuryCount }))),
    },
    {
      id: "frequencyRate",
      title: "Frequency rate",
      variant: "index",
      higherLabel: "Higher frequency rate",
      lowerLabel: "Lower frequency rate",
      ...buildTopFive(plantSummaries.map((plant) => ({ code: plant.code, name: plant.name, value: plant.frequencyIndex }))),
    },
    {
      id: "gravityRate",
      title: "Gravity rate",
      variant: "index",
      higherLabel: "Higher gravity rate",
      lowerLabel: "Lower gravity rate",
      ...buildTopFive(plantSummaries.map((plant) => ({ code: plant.code, name: plant.name, value: plant.severityIndex }))),
    },
    {
      id: "actions",
      title: "Actions",
      variant: "count",
      higherLabel: "More actions to close",
      lowerLabel: "More closed actions",
      higher: buildTopFive(plantSummaries.map((plant) => ({ code: plant.code, name: plant.name, value: plant.actionsToClose }))).higher,
      lower: buildTopFive(plantSummaries.map((plant) => ({ code: plant.code, name: plant.name, value: plant.closedActions }))).higher,
    },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-6">
      <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{ui.dashboard.corporateTitle}</h1>
            <p className="mt-1 text-sm text-slate-600">{ui.dashboard.corporateDescription}</p>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSelector currentLocale={locale} label={ui.dashboard.language} />
            {defaultPlantRole?.plantCode ? (
              <Link
                href={`/app/${defaultPlantRole.plantCode}/dashboards`}
                className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-100"
              >
                <span aria-hidden="true">↩</span>
                <span>Back to {defaultPlantRole.plantCode.toUpperCase()}</span>
              </Link>
            ) : null}
            <Link href="/app/corporate/reports" className="text-sm font-semibold text-teal-700 hover:underline">
              Open report history
            </Link>
          </div>
        </div>
      </div>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <form className="grid gap-3 md:grid-cols-5">
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.dashboard.year}</span>
            <input type="number" name="year" defaultValue={period.year} className="w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.dashboard.month}</span>
            <input type="number" name="month" min="1" max="12" defaultValue={period.month ?? ""} className="w-full rounded-md border border-slate-300 px-3 py-2" />
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
            <Link href="/app/corporate" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">{ui.dashboard.currentYear}</Link>
          </div>
        </form>
      </section>

      <CorporatePlantManager
        totalPlants={plantSummaries.length}
        totalValidatedEvents={totalValidatedEvents}
        totalOpenActions={totalOpenActions}
        totalClosedActions={totalClosedActions}
        totalActionsToClose={totalActionsToClose}
        totalClosedActionsPercent={totalClosedActionsPercent}
        totalActionsToClosePercent={totalActionsToClosePercent}
        totalNearMisses={totalNearMisses}
        totalInjuries={totalInjuries}
        totalFrequencyIndex={totalFrequencyIndex}
        totalSeverityIndex={totalSeverityIndex}
        totalCommunicationPyramid={totalCommunicationPyramid}
        rankings={rankings}
        initialPlants={plantSummaries}
      />

      {canManageGlobalRepeatability ? (
        <div className="mt-6">
          <RepeatabilityAlertEditor
            endpoint="/api/admin/repeatability-alerts"
            title="Global repeatability alerts"
            description="Define the default weekly alert thresholds for all plants. Plant admins can still override these values locally."
            initial={globalRepeatabilityConfig}
          />
        </div>
      ) : null}

      <CorporateActionPlans
        actions={corporateActions.map((row) => ({
          id: row.id,
          displayId: formatActionCode(row.plant.code, row.sequenceNumber),
          title: row.title,
          category: row.category,
          priority: row.priority,
          status: row.status,
          ownerName: row.ownerUser.name,
          dueDate: row.dueDate.toISOString().slice(0, 10),
          evidenceCount: row.evidenceAttachments.length,
          plantName: row.plant.name,
          plantCode: row.plant.code.toUpperCase(),
          plantRouteCode: row.plant.code,
        }))}
      />
    </main>
  );
}
