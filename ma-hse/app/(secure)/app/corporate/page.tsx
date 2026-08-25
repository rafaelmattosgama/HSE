import { CommunicationStatus, CommunicationType, RoleCode } from "@prisma/client";
import { History } from "lucide-react";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { formatActionCode } from "@/lib/helpers";
import { authOptions } from "@/lib/auth/options";
import { resolveDashboardPeriod, type DashboardSearchParams } from "@/lib/dashboard-period";
import {
  buildMonthBuckets,
  createEmptyMonthlyMetricSnapshot,
  type MonthlyMetricSnapshot,
  type RankingEntry,
  type RankingGroup,
  type RankingSeriesSnapshot,
} from "@/lib/dashboard-visualization";
import { prisma } from "@/lib/prisma";
import {
  GLOBAL_MODULE_TOGGLES_PARAMETER_KEY,
  MODULE_TOGGLES_PARAMETER_KEY,
  isModuleEnabled,
} from "@/lib/modules";
import { CompetenceService } from "@/lib/services/competence-service";
import { buildSewoRootCauseTopEntries, getSewoRootCauseCount } from "@/lib/sewo-root-causes";
import {
  buildCommunicationTypeTopEntries,
  getCommunicationTypeTotal,
  type CommunicationTypeTopEntry,
} from "@/lib/communication-type-top";
import { CorporatePlantManager } from "@/components/feature/corporate-plant-manager";
import { CorporateActionPlans } from "@/components/feature/corporate-action-plans";
import { CompetenceCorporateBoard } from "@/components/feature/competence-corporate-board";
import { EnvironmentDashboardBoard } from "@/components/feature/environment-dashboard-board";
import { RepeatabilityAlertEditor } from "@/components/feature/repeatability-alert-editor";
import { RootCauseTopFiveCard } from "@/components/feature/root-cause-top-five-card";
import { GroupSafetyDaysBoard } from "@/components/feature/group-safety-days-board";
import { SYSTEM_PARAMETER_KEYS } from "@/lib/constants";
import { buildEnvironmentDashboardPlant } from "@/lib/environment-dashboard";
import { getGlobalRepeatabilityAlertConfig } from "@/lib/services/parameter-service";
import { getUiDictionary } from "@/lib/ui-language";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { buildSafetyDaysSummary } from "@/lib/safety-days";
import {
  COMMUNICATION_IN_VALIDATION_STATUSES,
  isDashboardPyramidCommunicationStatus,
} from "@/lib/communication-status";

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

function toRootCauseRankingEntries(entries: ReturnType<typeof buildSewoRootCauseTopEntries>): RankingEntry[] {
  return entries.map((entry, index) => ({
    plantCode: `root-cause-${index}-${entry.label}`,
    plantName: entry.label,
    value: entry.percentage,
  }));
}

function toCommunicationTypeRankingEntries(entries: CommunicationTypeTopEntry[], prefix: string): RankingEntry[] {
  return entries.map((entry, index) => ({
    plantCode: `${prefix}-${index}-${entry.label}`,
    plantName: entry.label,
    value: entry.percentage,
  }));
}

function getMonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function shiftDateByYears(date: Date, years: number) {
  const shiftedDate = new Date(date);
  shiftedDate.setUTCFullYear(shiftedDate.getUTCFullYear() + years);
  return shiftedDate;
}

function getMetricValue(snapshot: MonthlyMetricSnapshot, metricId: "nearMisses" | "injuries" | "rootCauses" | "frequencyRate" | "gravityRate" | "actionsToClose" | "closedActions") {
  if (metricId === "nearMisses") return snapshot.nearMisses;
  if (metricId === "injuries") return snapshot.injuries;
  if (metricId === "rootCauses") return snapshot.rootCauses;
  if (metricId === "frequencyRate") return snapshot.frequencyRate;
  if (metricId === "gravityRate") return snapshot.gravityRate;
  if (metricId === "actionsToClose") return snapshot.actionsToClose;
  return snapshot.closedActions;
}

function getManualLastAccidentDate(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const rawDate = (value as Record<string, unknown>).manualLastAccidentDate;
  return typeof rawDate === "string" && rawDate.trim() ? rawDate : null;
}

function getHistoricalRecordDays(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const rawDays = (value as Record<string, unknown>).historicalRecordDays;
  return typeof rawDays === "number" && Number.isFinite(rawDays) ? Math.max(0, Math.floor(rawDays)) : null;
}

function getHistoricalRecordStartDate(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const rawDate = (value as Record<string, unknown>).historicalRecordStartDate;
  return typeof rawDate === "string" && rawDate.trim() ? rawDate : null;
}

export default async function CorporatePage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const session = await getServerSession(authOptions);
  const uiLocale = await getServerUiLocale({ userLanguage: session?.user.language });
  const ui = getUiDictionary(uiLocale);
  const period = resolveDashboardPeriod(await searchParams);
  const monthBuckets = buildMonthBuckets(period.from, period.to);
  const monthlyInputFilter = {
    OR: monthBuckets.map((bucket) => ({ year: bucket.year, month: bucket.month })),
  };
  const previousMonthlyInputFilter = {
    OR: monthBuckets.map((bucket) => ({ year: bucket.year - 1, month: bucket.month })),
  };
  const previousPeriod = {
    from: shiftDateByYears(period.from, -1),
    to: shiftDateByYears(period.to, -1),
  };
  const clearDatesParams = new URLSearchParams();
  clearDatesParams.set("year", String(period.year));
  if (period.month) {
    clearDatesParams.set("month", String(period.month));
  }
  const clearDatesHref = `/app/corporate?${clearDatesParams.toString()}`;
  const defaultPlantRole = session?.user.plantRoles.find(
    (entry) =>
      entry.role === RoleCode.N2_PLANT_MANAGER ||
      entry.role === RoleCode.N3_SAFETY ||
      entry.role === RoleCode.N4_SUPERVISOR ||
      entry.role === RoleCode.N5_OPERATOR,
  );

  const [
    plants,
    corporateActions,
    globalRepeatabilityConfig,
    injuryHistoryRows,
    safetyDaysConfigs,
    previousEnvironmentRows,
    previousYearInjuryRows,
    previousYearKpiRows,
    globalModuleParameter,
  ] = await Promise.all([
    prisma.plant.findMany({
      include: {
        systemParameters: {
          where: { key: MODULE_TOGGLES_PARAMETER_KEY },
        },
        communications: {
          where: {
            OR: [
              {
                eventDatetime: {
                  gte: period.from,
                  lte: period.to,
                },
              },
              {
                status: {
                  in: [...COMMUNICATION_IN_VALIDATION_STATUSES],
                },
                reportedAt: {
                  gte: period.from,
                  lte: period.to,
                },
              },
            ],
          },
          select: {
            id: true,
            type: true,
            lostDays: true,
            status: true,
            classification: true,
            eventDatetime: true,
            unsafeActType: {
              select: {
                name: true,
              },
            },
            unsafeConditionType: {
              select: {
                name: true,
              },
            },
            nearMissType: {
              select: {
                name: true,
              },
            },
          },
        },
        actions: {
          select: {
            id: true,
            status: true,
            createdAt: true,
          },
        },
        sewoRecords: {
          where: {
            analysisDate: {
              gte: period.from,
              lte: period.to,
            },
          },
          select: {
            analysisDate: true,
            templateData: true,
            causeSelections: {
              select: {
                selected: true,
                isRootCause: true,
                causeItem: {
                  select: {
                    label: true,
                  },
                },
              },
            },
          },
        },
        kpiInputs: {
          where: monthlyInputFilter,
        },
        monthlyInputs: {
          where: monthlyInputFilter,
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
    prisma.communication.findMany({
      where: {
        type: CommunicationType.ACCIDENT,
        status: {
          in: KPI_COMMUNICATION_STATUSES,
        },
      },
      select: {
        plantId: true,
        eventDatetime: true,
      },
      orderBy: {
        eventDatetime: "asc",
      },
    }),
    prisma.systemParameter.findMany({
      where: {
        key: SYSTEM_PARAMETER_KEYS.SAFETY_DAYS,
        plantId: {
          not: null,
        },
      },
      select: {
        plantId: true,
        valueJson: true,
      },
    }),
    prisma.plantMonthlyInput.findMany({
      where: previousMonthlyInputFilter,
    }),
    prisma.communication.findMany({
      where: {
        type: CommunicationType.ACCIDENT,
        status: {
          in: KPI_COMMUNICATION_STATUSES,
        },
        eventDatetime: {
          gte: previousPeriod.from,
          lte: previousPeriod.to,
        },
      },
      select: {
        plantId: true,
      },
    }),
    prisma.safetyKpiMonthlyInput.findMany({
      where: previousMonthlyInputFilter,
      select: {
        plantId: true,
        hoursWorked: true,
      },
    }),
    prisma.systemParameter.findFirst({
      where: { plantId: null, key: GLOBAL_MODULE_TOGGLES_PARAMETER_KEY },
    }),
  ]);
  const canManageGlobalRepeatability = session?.user.plantRoles.some(
    (entry) => entry.role === RoleCode.N0_ADMIN || entry.role === RoleCode.N1_CORPORATE,
  );

  const injuryDatesByPlantId = new Map<string, Date[]>();
  for (const row of injuryHistoryRows) {
    const entries = injuryDatesByPlantId.get(row.plantId) ?? [];
    entries.push(row.eventDatetime);
    injuryDatesByPlantId.set(row.plantId, entries);
  }
  const manualLastAccidentDateByPlantId = new Map(
    safetyDaysConfigs
      .filter((entry): entry is typeof entry & { plantId: string } => Boolean(entry.plantId))
      .map((entry) => [entry.plantId, getManualLastAccidentDate(entry.valueJson)]),
  );
  const historicalRecordDaysByPlantId = new Map(
    safetyDaysConfigs
      .filter((entry): entry is typeof entry & { plantId: string } => Boolean(entry.plantId))
      .map((entry) => [entry.plantId, getHistoricalRecordDays(entry.valueJson)]),
  );
  const historicalRecordStartDateByPlantId = new Map(
    safetyDaysConfigs
      .filter((entry): entry is typeof entry & { plantId: string } => Boolean(entry.plantId))
      .map((entry) => [entry.plantId, getHistoricalRecordStartDate(entry.valueJson)]),
  );
  const previousYearInjuryCountByPlantId = new Map<string, number>();
  for (const row of previousYearInjuryRows) {
    previousYearInjuryCountByPlantId.set(row.plantId, (previousYearInjuryCountByPlantId.get(row.plantId) ?? 0) + 1);
  }
  const previousYearHoursWorkedByPlantId = new Map<string, number>();
  for (const row of previousYearKpiRows) {
    previousYearHoursWorkedByPlantId.set(
      row.plantId,
      (previousYearHoursWorkedByPlantId.get(row.plantId) ?? 0) + Number(row.hoursWorked ?? 0),
    );
  }

  const plantSummaries = plants.map((plant) => {
    const monthlyMetricsMap = new Map(
      monthBuckets.map((bucket) => [bucket.key, createEmptyMonthlyMetricSnapshot(bucket.key, bucket.label)]),
    );
    const validCommunications = plant.communications.filter((entry) => KPI_COMMUNICATION_STATUSES.includes(entry.status));
    const pyramidCommunications = plant.communications.filter((entry) => isDashboardPyramidCommunicationStatus(entry.status));
    for (const entry of validCommunications) {
      const key = getMonthKey(entry.eventDatetime.getUTCFullYear(), entry.eventDatetime.getUTCMonth() + 1);
      const snapshot = monthlyMetricsMap.get(key);
      if (!snapshot) continue;
      snapshot.validatedEvents += 1;
      if (entry.type === "NEAR_MISS") snapshot.nearMisses += 1;
      if (entry.type === "ACCIDENT") snapshot.injuries += 1;
      snapshot.lostDays += entry.lostDays ?? 0;
    }

    for (const entry of plant.actions) {
      const key = getMonthKey(entry.createdAt.getUTCFullYear(), entry.createdAt.getUTCMonth() + 1);
      const snapshot = monthlyMetricsMap.get(key);
      if (!snapshot) continue;
      if (entry.status === "OPEN") snapshot.openActions += 1;
      if (entry.status === "CLOSED") snapshot.closedActions += 1;
      if (entry.status === "OPEN" || entry.status === "ONGOING") snapshot.actionsToClose += 1;
    }

    for (const entry of plant.sewoRecords) {
      const key = getMonthKey(entry.analysisDate.getUTCFullYear(), entry.analysisDate.getUTCMonth() + 1);
      const snapshot = monthlyMetricsMap.get(key);
      if (!snapshot) continue;
      snapshot.rootCauses += getSewoRootCauseCount(entry);
    }

    for (const entry of plant.kpiInputs) {
      const key = getMonthKey(entry.year, entry.month);
      const snapshot = monthlyMetricsMap.get(key);
      if (!snapshot) continue;
      snapshot.hoursWorked += Number(entry.hoursWorked ?? 0);
    }

    const monthlyMetrics = [...monthlyMetricsMap.values()].map((snapshot) => {
      const totalMonthlyActions = snapshot.openActions + snapshot.closedActions + Math.max(snapshot.actionsToClose - snapshot.openActions, 0);
      return {
        ...snapshot,
        closedActionsPercent: totalMonthlyActions > 0 ? (snapshot.closedActions / totalMonthlyActions) * 100 : 0,
        actionsToClosePercent: totalMonthlyActions > 0 ? (snapshot.actionsToClose / totalMonthlyActions) * 100 : 0,
        frequencyRate: snapshot.hoursWorked > 0 ? (snapshot.injuries / snapshot.hoursWorked) * ONE_MILLION : 0,
        gravityRate: snapshot.hoursWorked > 0 ? (snapshot.lostDays / snapshot.hoursWorked) * ONE_MILLION : 0,
      };
    });

    const nearMissCount = validCommunications.filter((entry) => entry.type === "NEAR_MISS").length;
    const injuryCount = validCommunications.filter((entry) => entry.type === "ACCIDENT").length;
    const rootCauseCount = plant.sewoRecords.reduce((sum, entry) => sum + getSewoRootCauseCount(entry), 0);
    const lostDays = validCommunications.reduce((sum, entry) => sum + (entry.lostDays ?? 0), 0);
    const hoursWorked = monthlyMetrics.reduce((sum, entry) => sum + entry.hoursWorked, 0);
    const openActions = plant.actions.filter((entry) => entry.status === "OPEN").length;
    const closedActions = plant.actions.filter((entry) => entry.status === "CLOSED").length;
    const actionsToClose = plant.actions.filter((entry) => entry.status === "OPEN" || entry.status === "ONGOING").length;
    const totalActions = plant.actions.length;
    const closedActionsPercent = totalActions > 0 ? (closedActions / totalActions) * 100 : 0;
    const actionsToClosePercent = totalActions > 0 ? (actionsToClose / totalActions) * 100 : 0;
    const frequencyIndex = hoursWorked > 0 ? (injuryCount / hoursWorked) * ONE_MILLION : 0;
    const previousYearHoursWorked = previousYearHoursWorkedByPlantId.get(plant.id) ?? 0;
    const previousYearInjuryCount = previousYearInjuryCountByPlantId.get(plant.id) ?? 0;
    const previousYearFrequencyIndex =
      previousYearHoursWorked > 0 ? (previousYearInjuryCount / previousYearHoursWorked) * ONE_MILLION : null;
    const severityIndex = hoursWorked > 0 ? (lostDays / hoursWorked) * ONE_MILLION : 0;
    const safetyDays = buildSafetyDaysSummary({
      plantCreatedAt: plant.createdAt,
      injuryDates: injuryDatesByPlantId.get(plant.id) ?? [],
      manualLastAccidentDate: manualLastAccidentDateByPlantId.get(plant.id) ?? null,
      historicalRecordDays: historicalRecordDaysByPlantId.get(plant.id) ?? null,
      historicalRecordStartDate: historicalRecordStartDateByPlantId.get(plant.id) ?? null,
    });

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
      rootCauseCount,
      frequencyIndex,
      previousYearFrequencyIndex,
      severityIndex,
      safetyDays,
      communicationPyramid: {
        unsafeAct: pyramidCommunications.filter((entry) => entry.type === "UNSAFE_ACT").length,
        unsafeCondition: pyramidCommunications.filter((entry) => entry.type === "UNSAFE_CONDITION").length,
        nearMiss: pyramidCommunications.filter((entry) => entry.type === "NEAR_MISS").length,
        firstAid: pyramidCommunications.filter((entry) => entry.type === "FIRST_AID").length,
        minorInjury: pyramidCommunications.filter((entry) => entry.type === "ACCIDENT" && entry.classification === "MINOR").length,
        seriousInjury: pyramidCommunications.filter((entry) => entry.type === "ACCIDENT" && entry.classification === "SERIOUS").length,
        fatal: pyramidCommunications.filter((entry) => entry.type === "ACCIDENT" && entry.classification === "FATAL").length,
      },
      leaders: plant.users
        .map((entry) => ({
          role: entry.role.code,
          email: entry.user.email,
          name: entry.user.name,
        }))
        .sort((a, b) => a.role.localeCompare(b.role)),
      monthlyMetrics,
    };
  });

  const totalValidatedEvents = plantSummaries.reduce((sum, plant) => sum + plant.validatedEvents, 0);
  const totalOpenActions = plantSummaries.reduce((sum, plant) => sum + plant.openActions, 0);
  const totalClosedActions = plantSummaries.reduce((sum, plant) => sum + plant.closedActions, 0);
  const totalActionsToClose = plantSummaries.reduce((sum, plant) => sum + plant.actionsToClose, 0);
  const totalNearMisses = plantSummaries.reduce((sum, plant) => sum + plant.nearMissCount, 0);
  const totalInjuries = plantSummaries.reduce((sum, plant) => sum + plant.injuryCount, 0);
  const totalRootCauses = plantSummaries.reduce((sum, plant) => sum + plant.rootCauseCount, 0);
  const rootCauseTopEntries = buildSewoRootCauseTopEntries(plants.flatMap((plant) => plant.sewoRecords));
  const rootCauseRankingEntries = toRootCauseRankingEntries(rootCauseTopEntries);
  const validCommunicationRows = plants.flatMap((plant) =>
    plant.communications.filter((entry) => KPI_COMMUNICATION_STATUSES.includes(entry.status)),
  );
  const unsafeActTypeTopEntries = buildCommunicationTypeTopEntries(validCommunicationRows, CommunicationType.UNSAFE_ACT);
  const unsafeConditionTypeTopEntries = buildCommunicationTypeTopEntries(validCommunicationRows, CommunicationType.UNSAFE_CONDITION);
  const nearMissTypeTopEntries = buildCommunicationTypeTopEntries(validCommunicationRows, CommunicationType.NEAR_MISS);
  const unsafeActTypeTotal = getCommunicationTypeTotal(validCommunicationRows, CommunicationType.UNSAFE_ACT);
  const unsafeConditionTypeTotal = getCommunicationTypeTotal(validCommunicationRows, CommunicationType.UNSAFE_CONDITION);
  const nearMissTypeTotal = getCommunicationTypeTotal(validCommunicationRows, CommunicationType.NEAR_MISS);
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
  const environmentPlants = plants.map((plant) =>
    buildEnvironmentDashboardPlant({
      id: plant.id,
      code: plant.code,
      name: plant.name,
      rows: plant.monthlyInputs,
    }),
  );
  const previousEnvironmentPlants = plants.map((plant) =>
    buildEnvironmentDashboardPlant({
      id: plant.id,
      code: plant.code,
      name: plant.name,
      rows: previousEnvironmentRows.filter((row) => row.plantId === plant.id),
    }),
  );

  const competenceEnabledPlantIds = plants
    .filter((plant) =>
      isModuleEnabled(
        "COMPETENCE_AUTHORIZATIONS",
        globalModuleParameter?.valueJson,
        plant.systemParameters[0]?.valueJson,
      ),
    )
    .map((plant) => plant.id);
  const competenceCoverageByPlant = await CompetenceService.getAuthorizationCoverageByPlant(competenceEnabledPlantIds);
  const competencePlants = plants
    .filter((plant) => competenceEnabledPlantIds.includes(plant.id))
    .map((plant) => {
      const coverage = competenceCoverageByPlant.get(plant.id) ?? {
        requiredTotal: 0,
        validCount: 0,
        coveragePercent: null,
        expiredCount: 0,
      };
      return {
        id: plant.id,
        code: plant.code,
        name: plant.name,
        ...coverage,
      };
    });

  const rankings: RankingGroup[] = [
    {
      id: "root-causes-top",
      title: ui.dashboard.rootCauseTopFive,
      variant: "percent",
      higher: rootCauseRankingEntries,
      lower: [],
    },
    {
      id: "unsafe-act-types-top",
      title: ui.dashboard.unsafeActTypeTopFive,
      variant: "percent",
      higher: toCommunicationTypeRankingEntries(unsafeActTypeTopEntries, "unsafe-act-type"),
      lower: [],
    },
    {
      id: "unsafe-condition-types-top",
      title: ui.dashboard.unsafeConditionTypeTopFive,
      variant: "percent",
      higher: toCommunicationTypeRankingEntries(unsafeConditionTypeTopEntries, "unsafe-condition-type"),
      lower: [],
    },
    {
      id: "near-miss-types-top",
      title: ui.dashboard.nearMissTypeTopFive,
      variant: "percent",
      higher: toCommunicationTypeRankingEntries(nearMissTypeTopEntries, "near-miss-type"),
      lower: [],
    },
    {
      id: "nearMisses",
      title: ui.dashboard.nearMisses,
      variant: "count",
      higherLabel: ui.dashboard.higherNearMisses,
      lowerLabel: ui.dashboard.lowerNearMisses,
      ...buildTopFive(plantSummaries.map((plant) => ({ code: plant.code, name: plant.name, value: plant.nearMissCount }))),
    },
    {
      id: "injuries",
      title: ui.dashboard.injuries,
      variant: "count",
      higherLabel: ui.dashboard.higherInjuries,
      lowerLabel: ui.dashboard.lowerInjuries,
      ...buildTopFive(plantSummaries.map((plant) => ({ code: plant.code, name: plant.name, value: plant.injuryCount }))),
    },
    {
      id: "frequencyRate",
      title: ui.dashboard.frequencyRate,
      variant: "index",
      higherLabel: ui.dashboard.higherFrequencyRate,
      lowerLabel: ui.dashboard.lowerFrequencyRate,
      ...buildTopFive(plantSummaries.map((plant) => ({ code: plant.code, name: plant.name, value: plant.frequencyIndex }))),
    },
    {
      id: "gravityRate",
      title: ui.dashboard.gravityRate,
      variant: "index",
      higherLabel: ui.dashboard.higherGravityRate,
      lowerLabel: ui.dashboard.lowerGravityRate,
      ...buildTopFive(plantSummaries.map((plant) => ({ code: plant.code, name: plant.name, value: plant.severityIndex }))),
    },
    {
      id: "actions",
      title: ui.dashboard.actionsRanking,
      variant: "count",
      higherLabel: ui.dashboard.moreActionsToClose,
      lowerLabel: ui.dashboard.moreClosedActions,
      higher: buildTopFive(plantSummaries.map((plant) => ({ code: plant.code, name: plant.name, value: plant.actionsToClose }))).higher,
      lower: buildTopFive(plantSummaries.map((plant) => ({ code: plant.code, name: plant.name, value: plant.closedActions }))).higher,
    },
  ];

  const rankingMonthlySeries: Record<string, RankingSeriesSnapshot[]> = {
    "root-causes-top": monthBuckets.map((bucket) => ({
      monthKey: bucket.key,
      monthLabel: bucket.label,
      entries: toRootCauseRankingEntries(
        buildSewoRootCauseTopEntries(
          plants.flatMap((plant) =>
            plant.sewoRecords.filter(
              (entry) => getMonthKey(entry.analysisDate.getUTCFullYear(), entry.analysisDate.getUTCMonth() + 1) === bucket.key,
            ),
          ),
        ),
      ),
    })),
    "unsafe-act-types-top": monthBuckets.map((bucket) => {
      const monthRows = validCommunicationRows.filter(
        (entry) => getMonthKey(entry.eventDatetime.getUTCFullYear(), entry.eventDatetime.getUTCMonth() + 1) === bucket.key,
      );

      return {
        monthKey: bucket.key,
        monthLabel: bucket.label,
        entries: toCommunicationTypeRankingEntries(
          buildCommunicationTypeTopEntries(monthRows, CommunicationType.UNSAFE_ACT),
          "unsafe-act-type",
        ),
      };
    }),
    "unsafe-condition-types-top": monthBuckets.map((bucket) => {
      const monthRows = validCommunicationRows.filter(
        (entry) => getMonthKey(entry.eventDatetime.getUTCFullYear(), entry.eventDatetime.getUTCMonth() + 1) === bucket.key,
      );

      return {
        monthKey: bucket.key,
        monthLabel: bucket.label,
        entries: toCommunicationTypeRankingEntries(
          buildCommunicationTypeTopEntries(monthRows, CommunicationType.UNSAFE_CONDITION),
          "unsafe-condition-type",
        ),
      };
    }),
    "near-miss-types-top": monthBuckets.map((bucket) => {
      const monthRows = validCommunicationRows.filter(
        (entry) => getMonthKey(entry.eventDatetime.getUTCFullYear(), entry.eventDatetime.getUTCMonth() + 1) === bucket.key,
      );

      return {
        monthKey: bucket.key,
        monthLabel: bucket.label,
        entries: toCommunicationTypeRankingEntries(
          buildCommunicationTypeTopEntries(monthRows, CommunicationType.NEAR_MISS),
          "near-miss-type",
        ),
      };
    }),
    "nearMisses-higher": monthBuckets.map((bucket) => ({
      monthKey: bucket.key,
      monthLabel: bucket.label,
      entries: buildTopFive(
        plantSummaries.map((plant) => ({
          code: plant.code,
          name: plant.name,
          value: getMetricValue(
            plant.monthlyMetrics.find((snapshot) => snapshot.monthKey === bucket.key) ?? createEmptyMonthlyMetricSnapshot(bucket.key, bucket.label),
            "nearMisses",
          ),
        })),
      ).higher,
    })),
    "nearMisses-lower": monthBuckets.map((bucket) => ({
      monthKey: bucket.key,
      monthLabel: bucket.label,
      entries: buildTopFive(
        plantSummaries.map((plant) => ({
          code: plant.code,
          name: plant.name,
          value: getMetricValue(
            plant.monthlyMetrics.find((snapshot) => snapshot.monthKey === bucket.key) ?? createEmptyMonthlyMetricSnapshot(bucket.key, bucket.label),
            "nearMisses",
          ),
        })),
      ).lower,
    })),
    "injuries-higher": monthBuckets.map((bucket) => ({
      monthKey: bucket.key,
      monthLabel: bucket.label,
      entries: buildTopFive(
        plantSummaries.map((plant) => ({
          code: plant.code,
          name: plant.name,
          value: getMetricValue(
            plant.monthlyMetrics.find((snapshot) => snapshot.monthKey === bucket.key) ?? createEmptyMonthlyMetricSnapshot(bucket.key, bucket.label),
            "injuries",
          ),
        })),
      ).higher,
    })),
    "injuries-lower": monthBuckets.map((bucket) => ({
      monthKey: bucket.key,
      monthLabel: bucket.label,
      entries: buildTopFive(
        plantSummaries.map((plant) => ({
          code: plant.code,
          name: plant.name,
          value: getMetricValue(
            plant.monthlyMetrics.find((snapshot) => snapshot.monthKey === bucket.key) ?? createEmptyMonthlyMetricSnapshot(bucket.key, bucket.label),
            "injuries",
          ),
        })),
      ).lower,
    })),
    "frequencyRate-higher": monthBuckets.map((bucket) => ({
      monthKey: bucket.key,
      monthLabel: bucket.label,
      entries: buildTopFive(
        plantSummaries.map((plant) => ({
          code: plant.code,
          name: plant.name,
          value: getMetricValue(
            plant.monthlyMetrics.find((snapshot) => snapshot.monthKey === bucket.key) ?? createEmptyMonthlyMetricSnapshot(bucket.key, bucket.label),
            "frequencyRate",
          ),
        })),
      ).higher,
    })),
    "frequencyRate-lower": monthBuckets.map((bucket) => ({
      monthKey: bucket.key,
      monthLabel: bucket.label,
      entries: buildTopFive(
        plantSummaries.map((plant) => ({
          code: plant.code,
          name: plant.name,
          value: getMetricValue(
            plant.monthlyMetrics.find((snapshot) => snapshot.monthKey === bucket.key) ?? createEmptyMonthlyMetricSnapshot(bucket.key, bucket.label),
            "frequencyRate",
          ),
        })),
      ).lower,
    })),
    "gravityRate-higher": monthBuckets.map((bucket) => ({
      monthKey: bucket.key,
      monthLabel: bucket.label,
      entries: buildTopFive(
        plantSummaries.map((plant) => ({
          code: plant.code,
          name: plant.name,
          value: getMetricValue(
            plant.monthlyMetrics.find((snapshot) => snapshot.monthKey === bucket.key) ?? createEmptyMonthlyMetricSnapshot(bucket.key, bucket.label),
            "gravityRate",
          ),
        })),
      ).higher,
    })),
    "gravityRate-lower": monthBuckets.map((bucket) => ({
      monthKey: bucket.key,
      monthLabel: bucket.label,
      entries: buildTopFive(
        plantSummaries.map((plant) => ({
          code: plant.code,
          name: plant.name,
          value: getMetricValue(
            plant.monthlyMetrics.find((snapshot) => snapshot.monthKey === bucket.key) ?? createEmptyMonthlyMetricSnapshot(bucket.key, bucket.label),
            "gravityRate",
          ),
        })),
      ).lower,
    })),
    "actions-higher": monthBuckets.map((bucket) => ({
      monthKey: bucket.key,
      monthLabel: bucket.label,
      entries: buildTopFive(
        plantSummaries.map((plant) => ({
          code: plant.code,
          name: plant.name,
          value: getMetricValue(
            plant.monthlyMetrics.find((snapshot) => snapshot.monthKey === bucket.key) ?? createEmptyMonthlyMetricSnapshot(bucket.key, bucket.label),
            "actionsToClose",
          ),
        })),
      ).higher,
    })),
    "actions-lower": monthBuckets.map((bucket) => ({
      monthKey: bucket.key,
      monthLabel: bucket.label,
      entries: buildTopFive(
        plantSummaries.map((plant) => ({
          code: plant.code,
          name: plant.name,
          value: getMetricValue(
            plant.monthlyMetrics.find((snapshot) => snapshot.monthKey === bucket.key) ?? createEmptyMonthlyMetricSnapshot(bucket.key, bucket.label),
            "closedActions",
          ),
        })),
      ).higher,
    })),
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-6">
      <div className="app-hero mb-6 rounded-2xl p-6" data-onboarding="corporate-overview">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{ui.dashboard.corporateTitle}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {defaultPlantRole?.plantCode ? (
              <Link
                href={`/app/${defaultPlantRole.plantCode}/dashboards`}
                className="app-toolbar rounded-full border-teal-200 bg-teal-50 px-4 text-teal-800 hover:bg-teal-100"
              >
                <span aria-hidden="true">↩</span>
                <span>{ui.dashboard.backToPlant.replace("{plant}", defaultPlantRole.plantCode.toUpperCase())}</span>
              </Link>
            ) : null}
            <Link href="/app/corporate/reports" data-onboarding="corporate-reports" className="app-toolbar text-teal-700">
              <History className="h-4 w-4" />
              {ui.dashboard.openReportHistory}
            </Link>
          </div>
        </div>
      </div>

      <section className="app-panel mb-6 rounded-xl p-5">
        <form className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_auto]">
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.dashboard.year}</span>
            <input type="number" name="year" defaultValue={period.year} className="h-11 w-full rounded-[10px] border border-slate-300 px-3 py-2" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.dashboard.month}</span>
            <input type="number" name="month" min="1" max="12" defaultValue={period.month ?? ""} className="h-11 w-full rounded-[10px] border border-slate-300 px-3 py-2" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.dashboard.from}</span>
            <input type="date" name="from" defaultValue={period.mode === "range" ? period.from.toISOString().slice(0, 10) : ""} className="h-11 w-full rounded-[10px] border border-slate-300 px-3 py-2" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ui.dashboard.to}</span>
            <input type="date" name="to" defaultValue={period.mode === "range" ? period.to.toISOString().slice(0, 10) : ""} className="h-11 w-full rounded-[10px] border border-slate-300 px-3 py-2" />
          </label>
          <div className="flex flex-wrap items-end gap-2 xl:justify-end">
            <button
              type="submit"
              className="inline-flex h-11 min-w-[104px] items-center justify-center whitespace-nowrap rounded-[10px] bg-slate-900 px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(6,26,82,0.14)]"
            >
              {ui.dashboard.apply}
            </button>
            <Link href={clearDatesHref} className="app-toolbar min-w-[118px] whitespace-nowrap">
              {ui.dashboard.clearDates}
            </Link>
            <Link href="/app/corporate" className="app-toolbar min-w-[104px] whitespace-nowrap">
              {ui.dashboard.currentYear}
            </Link>
          </div>
        </form>
      </section>

      <GroupSafetyDaysBoard plants={plantSummaries.map((plant) => ({
        id: plant.id,
        code: plant.code,
        name: plant.name,
        safetyDays: plant.safetyDays,
        currentFrequencyIndex: plant.frequencyIndex,
        previousYearFrequencyIndex: plant.previousYearFrequencyIndex,
      }))} labels={ui.dashboard} />

      <section className="mb-6 grid gap-4 xl:grid-cols-4">
        <RootCauseTopFiveCard
          title={ui.dashboard.rootCauseTopFive}
          entries={rootCauseTopEntries}
          total={totalRootCauses}
          noDataLabel={ui.dashboard.noRootCauses}
          totalLabel={ui.dashboard.rootCauseTotal}
        />
        <RootCauseTopFiveCard
          title={ui.dashboard.unsafeActTypeTopFive}
          entries={unsafeActTypeTopEntries}
          total={unsafeActTypeTotal}
          noDataLabel={ui.dashboard.noUnsafeActTypes}
          totalLabel={ui.dashboard.rootCauseTotal}
        />
        <RootCauseTopFiveCard
          title={ui.dashboard.unsafeConditionTypeTopFive}
          entries={unsafeConditionTypeTopEntries}
          total={unsafeConditionTypeTotal}
          noDataLabel={ui.dashboard.noUnsafeConditionTypes}
          totalLabel={ui.dashboard.rootCauseTotal}
        />
        <RootCauseTopFiveCard
          title={ui.dashboard.nearMissTypeTopFive}
          entries={nearMissTypeTopEntries}
          total={nearMissTypeTotal}
          noDataLabel={ui.dashboard.noNearMissTypes}
          totalLabel={ui.dashboard.rootCauseTotal}
        />
      </section>

      <EnvironmentDashboardBoard
        title={ui.modules.environmentDashboard}
        scopeLabel={`${plantSummaries.length} ${ui.dashboard.plants.toLowerCase()}`}
        periodLabel={period.label}
        plants={environmentPlants}
        comparisonPlants={previousEnvironmentPlants}
        periodMonthsCount={monthBuckets.length}
        storageKeyBase="ma-hse-environment-corporate"
        className="mb-6"
        labels={ui.dashboard}
      />

      {competencePlants.length > 0 ? (
        <CompetenceCorporateBoard plants={competencePlants} labels={ui.dashboard} />
      ) : null}

      <div data-onboarding="corporate-comparison">
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
          totalRootCauses={totalRootCauses}
          totalFrequencyIndex={totalFrequencyIndex}
          totalSeverityIndex={totalSeverityIndex}
          totalCommunicationPyramid={totalCommunicationPyramid}
          rankings={rankings}
          rankingMonthlySeries={rankingMonthlySeries}
          initialPlants={plantSummaries}
          title={ui.dashboard.corporateIndicators}
          plantListTitle={ui.dashboard.corporatePlants}
          pyramidDescription={ui.dashboard.corporatePyramidDescription}
          rootCauseMetricLabel={ui.dashboard.sewoRootCauses}
          labels={ui.dashboard}
        />
      </div>

      {canManageGlobalRepeatability ? (
        <div className="mt-6">
          <RepeatabilityAlertEditor
            endpoint="/api/admin/repeatability-alerts"
            title={ui.dashboard.globalRepeatabilityAlerts}
            description={ui.dashboard.globalRepeatabilityAlertsDescription}
            initial={globalRepeatabilityConfig}
            labels={ui.dashboard}
          />
        </div>
      ) : null}

      <div data-onboarding="corporate-actions">
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
      </div>
    </main>
  );
}
