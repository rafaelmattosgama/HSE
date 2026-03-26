import { RoleCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CorporatePlantManager } from "@/components/feature/corporate-plant-manager";

const KPI_COMMUNICATION_STATUSES = ["VALID_OPEN", "ONGOING", "CLOSED"] as const;
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

export default async function CorporatePage() {
  const plants = await prisma.plant.findMany({
    include: {
      communications: {
        where: {
          status: {
            in: KPI_COMMUNICATION_STATUSES,
          },
        },
        select: {
          id: true,
          type: true,
          lostDays: true,
        },
      },
      actions: {
        select: {
          id: true,
          status: true,
        },
      },
      kpiInputs: true,
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
  });

  const plantSummaries = plants.map((plant) => {
    const nearMissCount = plant.communications.filter((entry) => entry.type === "NEAR_MISS").length;
    const injuryCount = plant.communications.filter((entry) => entry.type === "ACCIDENT").length;
    const lostDays = plant.communications.reduce((sum, entry) => sum + (entry.lostDays ?? 0), 0);
    const hoursWorked = plant.kpiInputs.reduce((sum, entry) => sum + Number(entry.hoursWorked), 0);
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
  const totalHoursWorked = plants.reduce((sum, plant) => sum + plant.kpiInputs.reduce((innerSum, entry) => innerSum + Number(entry.hoursWorked), 0), 0);
  const totalLostDays = plants.reduce(
    (sum, plant) => sum + plant.communications.reduce((innerSum, entry) => innerSum + (entry.lostDays ?? 0), 0),
    0,
  );
  const totalActionPool = totalOpenActions + totalClosedActions + plantSummaries.reduce((sum, plant) => sum + (plant.actionsToClose - plant.openActions), 0);
  const totalClosedActionsPercent = totalActionPool > 0 ? (totalClosedActions / totalActionPool) * 100 : 0;
  const totalActionsToClosePercent = totalActionPool > 0 ? (totalActionsToClose / totalActionPool) * 100 : 0;
  const totalFrequencyIndex = totalHoursWorked > 0 ? (totalInjuries / totalHoursWorked) * ONE_MILLION : 0;
  const totalSeverityIndex = totalHoursWorked > 0 ? (totalLostDays / totalHoursWorked) * ONE_MILLION : 0;

  const rankings = [
    {
      title: "Near misses",
      higherLabel: "Higher number of near misses",
      lowerLabel: "Lower number of near misses",
      ...buildTopFive(plantSummaries.map((plant) => ({ code: plant.code, name: plant.name, value: plant.nearMissCount }))),
    },
    {
      title: "Injuries",
      higherLabel: "Higher number of injuries",
      lowerLabel: "Lower number of injuries",
      ...buildTopFive(plantSummaries.map((plant) => ({ code: plant.code, name: plant.name, value: plant.injuryCount }))),
    },
    {
      title: "Frequency index",
      higherLabel: "Higher frequency index",
      lowerLabel: "Lower frequency index",
      ...buildTopFive(plantSummaries.map((plant) => ({ code: plant.code, name: plant.name, value: plant.frequencyIndex }))),
    },
    {
      title: "Severity index",
      higherLabel: "Higher severity index",
      lowerLabel: "Lower severity index",
      ...buildTopFive(plantSummaries.map((plant) => ({ code: plant.code, name: plant.name, value: plant.severityIndex }))),
    },
    {
      title: "Actions",
      higherLabel: "More actions to close",
      lowerLabel: "More closed actions",
      higher: buildTopFive(plantSummaries.map((plant) => ({ code: plant.code, name: plant.name, value: plant.actionsToClose }))).higher,
      lower: buildTopFive(plantSummaries.map((plant) => ({ code: plant.code, name: plant.name, value: plant.closedActions }))).higher,
    },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-6">
      <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Corporate Benchmark</h1>
        <p className="mt-1 text-sm text-slate-600">Cross-plant read-only view for validated events and open actions.</p>
      </div>

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
        rankings={rankings}
        initialPlants={plantSummaries}
      />
    </main>
  );
}
