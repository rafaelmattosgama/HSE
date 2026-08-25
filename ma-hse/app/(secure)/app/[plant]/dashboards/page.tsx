import Link from "next/link";
import { CommunicationType, MasterDataEntityType, SEWOStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { resolveDashboardPeriod, type DashboardSearchParams } from "@/lib/dashboard-period";
import {
  buildMonthBuckets,
  createEmptyMonthlyMetricSnapshot,
  limitDashboardMonthBucketsToObserved,
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
import { FireEquipmentService } from "@/lib/services/fire-equipment-service";
import { buildSewoRootCauseTopEntries, getSewoRootCauseCount } from "@/lib/sewo-root-causes";
import {
  buildCommunicationTypeTopEntries,
  getCommunicationTypeTotal,
  type CommunicationTypeTopEntry,
} from "@/lib/communication-type-top";
import { CorporatePlantManager } from "@/components/feature/corporate-plant-manager";
import { RootCauseTopFiveCard } from "@/components/feature/root-cause-top-five-card";
import { SafetyCommunicationPyramid } from "@/components/feature/safety-communication-pyramid";
import { SafetyDashboardKpiGroups } from "@/components/feature/safety-dashboard-kpi-groups";
import { SafetyDaysSpotlight } from "@/components/feature/safety-days-dashboard";
import { getUiDictionary } from "@/lib/ui-language";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { buildSafetyDaysSummary } from "@/lib/safety-days";
import { getPlantSafetyDaysConfig } from "@/lib/services/parameter-service";
import { localizeMasterDataRows } from "@/lib/services/master-data-translation-service";
import { AppHero } from "@/components/ui/app-surface";
import {
  getLinkedCommunicationClosureRate,
  isDashboardOpenAction,
  isDashboardOverdueAction,
} from "@/lib/dashboard-actions";
import {
  COMMUNICATION_IN_VALIDATION_STATUSES,
  isDashboardPyramidCommunicationStatus,
} from "@/lib/communication-status";
import {
  buildSifPsifIndicatorBreakdown,
  SIF_PSIF_ELIGIBLE_COMMUNICATION_TYPES,
} from "@/lib/sif-psif-indicators";
import {
  getSafetyDashboardRole,
  hasSafetyDashboardAccess,
  hasSafetyDashboardDetailedReadAccess,
} from "@/lib/rbac/dashboard";

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

function buildPyramidCommunicationWhere(plantId: string, period: { from: Date; to: Date }) {
  return {
    plantId,
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
  };
}

function buildClosedSifPsifIncidentWhere(plantId: string, period: { from: Date; to: Date }) {
  return {
    plantId,
    type: {
      in: [...SIF_PSIF_ELIGIBLE_COMMUNICATION_TYPES],
    },
    eventDatetime: {
      gte: period.from,
      lte: period.to,
    },
    sewoRecords: {
      some: {
        status: SEWOStatus.CLOSED,
      },
    },
  };
}

function getHomologousPeriod(period: { from: Date; to: Date }) {
  const from = new Date(period.from);
  const to = new Date(period.to);
  from.setUTCFullYear(from.getUTCFullYear() - 1);
  to.setUTCFullYear(to.getUTCFullYear() - 1);
  return { from, to };
}

function getHomologousTrend(current: number, previous: number, label: string, locale: string, digits = 0) {
  const difference = current - previous;
  const formatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
    signDisplay: "always",
  });
  const direction = difference > 0 ? "↑" : difference < 0 ? "↓" : "→";
  return `${direction} ${formatter.format(difference)} ${label.toLocaleLowerCase(locale)}`;
}

function actionWasOpenAt(
  action: { createdAt: Date; closedAt: Date | null; reopenedAt: Date | null },
  referenceDate: Date,
) {
  if (action.createdAt > referenceDate) return false;
  if (!action.closedAt || action.closedAt > referenceDate) return true;
  return Boolean(action.reopenedAt && action.reopenedAt > action.closedAt && action.reopenedAt <= referenceDate);
}

function getMonthEnd(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

function buildMonthlyInputFilter(period: { from: Date; to: Date }) {
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
  const total = [...map.values()].reduce((sum, value) => sum + value, 0);

  return [...map.entries()]
    .map(([label, value], index) => ({
      plantCode: `rank-${index}-${label}`,
      plantName: label,
      value,
      count: value,
      total,
      percentage: total > 0 ? (value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value || a.plantName.localeCompare(b.plantName))
    .slice(0, 5);
}

function toRootCauseRankingEntries(
  entries: ReturnType<typeof buildSewoRootCauseTopEntries>,
  total: number,
): RankingEntry[] {
  return entries.map((entry, index) => ({
    plantCode: `root-cause-${index}-${entry.label}`,
    plantName: entry.label,
    value: entry.percentage,
    count: entry.count,
    total,
    percentage: entry.percentage,
  }));
}

function toCommunicationTypeRankingEntries(
  entries: CommunicationTypeTopEntry[],
  prefix: string,
  total: number,
): RankingEntry[] {
  return entries.map((entry, index) => ({
    plantCode: `${prefix}-${index}-${entry.label}`,
    plantName: entry.label,
    value: entry.percentage,
    count: entry.count,
    total,
    percentage: entry.percentage,
  }));
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

function getMonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function getMonthLabel(locale: string, monthIndex: number) {
  const monthName = new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(Date.UTC(2024, monthIndex, 1)));
  const localizedName = `${monthName.slice(0, 1).toLocaleUpperCase(locale)}${monthName.slice(1)}`;
  return `${String(monthIndex + 1).padStart(2, "0")} - ${localizedName}`;
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
  if (!session?.user || !hasSafetyDashboardAccess(plant, session.user.plantRoles)) {
    notFound();
  }
  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });
  const uiLocale = await getServerUiLocale({
    userLanguage: session?.user.language,
    plantLanguage: plantRow.defaultLanguage,
  });
  const ui = getUiDictionary(uiLocale);
  const actorRole = getSafetyDashboardRole(plant, session.user.plantRoles);
  const canViewCompetenceKpis = hasSafetyDashboardDetailedReadAccess(actorRole);
  // Fase 6: same detailed-read gate as competences — one flag, two modules.
  const canViewDetailedModuleKpis = canViewCompetenceKpis;
  const [globalModuleParameter, plantModuleParameter] = canViewDetailedModuleKpis
    ? await Promise.all([
        prisma.systemParameter.findFirst({ where: { plantId: null, key: GLOBAL_MODULE_TOGGLES_PARAMETER_KEY } }),
        prisma.systemParameter.findFirst({ where: { plantId: plantRow.id, key: MODULE_TOGGLES_PARAMETER_KEY } }),
      ])
    : [null, null];
  const competenceCoverage = canViewCompetenceKpis && isModuleEnabled(
    "COMPETENCE_AUTHORIZATIONS",
    globalModuleParameter?.valueJson,
    plantModuleParameter?.valueJson,
  )
    ? await CompetenceService.getPlantAuthorizationCoverage(plantRow.id)
    : null;
  const fireEquipmentCoverage = canViewDetailedModuleKpis && isModuleEnabled(
    "FIRE_SAFETY_EQUIPMENT",
    globalModuleParameter?.valueJson,
    plantModuleParameter?.valueJson,
  )
    ? await FireEquipmentService.getPlantComplianceCoverage(plantRow.id)
    : null;
  const period = resolveDashboardPeriod(currentSearchParams);
  const now = new Date();
  const backlogReferenceDate = period.to < now ? period.to : now;
  const monthBuckets = limitDashboardMonthBucketsToObserved(buildMonthBuckets(period.from, period.to), {
    now,
    partialLabel: ui.dashboard.kpiPartialMonth,
    markCurrentMonth: period.to >= now,
  });
  const monthlyInputFilter = buildMonthlyInputFilter(period);
  const homologousPeriod = getHomologousPeriod(period);
  const homologousMonthlyInputFilter = buildMonthlyInputFilter(homologousPeriod);

  const [
    communicationRows,
    pyramidCommunicationRows,
    homologousPyramidCommunicationRows,
    actionRows,
    sewoRows,
    backlogActionRows,
    homologousSewoRows,
    hoursWorkedRows,
    homologousHoursWorkedRows,
    employeeRows,
    communicationDateRange,
    monthlyYearRange,
    injuryHistoryRows,
    sifPsifIncidentRows,
    homologousSifPsifIncidentRows,
  ] = await prisma.$transaction([
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
        eventDatetime: true,
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
            id: true,
            name: true,
            sourceLanguage: true,
          },
        },
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
        actions: {
          select: {
            status: true,
          },
        },
      },
    }),
    prisma.communication.findMany({
      where: buildPyramidCommunicationWhere(plantRow.id, period),
      select: {
        type: true,
        status: true,
        classification: true,
        lostDays: true,
        actions: {
          select: {
            status: true,
          },
        },
      },
    }),
    prisma.communication.findMany({
      where: buildPyramidCommunicationWhere(plantRow.id, homologousPeriod),
      select: {
        type: true,
        status: true,
        classification: true,
        lostDays: true,
        actions: {
          select: {
            status: true,
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
        closedAt: true,
        ownerUserId: true,
      },
    }),
    prisma.sEWO.findMany({
      where: {
        plantId: plantRow.id,
        deletedAt: null,
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
    }),
    prisma.action.findMany({
      where: {
        plantId: plantRow.id,
        createdAt: {
          lte: backlogReferenceDate,
        },
      },
      select: {
        status: true,
        dueDate: true,
        createdAt: true,
        closedAt: true,
        reopenedAt: true,
      },
    }),
    prisma.sEWO.findMany({
      where: {
        plantId: plantRow.id,
        deletedAt: null,
        analysisDate: {
          gte: homologousPeriod.from,
          lte: homologousPeriod.to,
        },
      },
      select: {
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
    }),
    prisma.plantMonthlyInput.findMany({
      where: {
        plantId: plantRow.id,
        ...monthlyInputFilter,
      },
      select: {
        year: true,
        month: true,
        hoursWorked: true,
      },
    }),
    prisma.plantMonthlyInput.findMany({
      where: {
        plantId: plantRow.id,
        ...homologousMonthlyInputFilter,
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
    prisma.communication.findMany({
      where: {
        plantId: plantRow.id,
        type: "ACCIDENT",
        status: {
          in: ["VALID_OPEN", "ONGOING", "CLOSED"],
        },
      },
      select: {
        eventDatetime: true,
      },
      orderBy: {
        eventDatetime: "asc",
      },
    }),
    prisma.communication.findMany({
      where: buildClosedSifPsifIncidentWhere(plantRow.id, period),
      select: {
        id: true,
        type: true,
        sewoRecords: {
          where: {
            status: SEWOStatus.CLOSED,
          },
          select: {
            templateData: true,
          },
        },
      },
    }),
    prisma.communication.findMany({
      where: buildClosedSifPsifIncidentWhere(plantRow.id, homologousPeriod),
      select: {
        id: true,
        type: true,
        sewoRecords: {
          where: {
            status: SEWOStatus.CLOSED,
          },
          select: {
            templateData: true,
          },
        },
      },
    }),
  ]);
  const localizedWorkstations = await localizeMasterDataRows(
    MasterDataEntityType.WORKSTATION,
    Array.from(
      new Map(
        communicationRows.flatMap((row) => row.workstation ? [[row.workstation.id, row.workstation] as const] : []),
      ).values(),
    ),
    uiLocale,
  );
  const localizedWorkstationById = new Map(localizedWorkstations.map((row) => [row.id, row.name]));
  const safetyDaysConfig = await getPlantSafetyDaysConfig(plantRow.id);
  const safetyDays = buildSafetyDaysSummary({
    plantCreatedAt: plantRow.createdAt,
    injuryDates: injuryHistoryRows.map((entry) => entry.eventDatetime),
    manualLastAccidentDate: safetyDaysConfig.manualLastAccidentDate,
    historicalRecordDays: safetyDaysConfig.historicalRecordDays,
    historicalRecordStartDate: safetyDaysConfig.historicalRecordStartDate,
  });

  const employeeByNo = new Map(employeeRows.map((entry) => [entry.employeeNo, entry]));
  const validCommunications = communicationRows.filter((entry) => ["VALID_OPEN", "ONGOING", "CLOSED"].includes(entry.status));
  const pyramidCommunications = pyramidCommunicationRows.filter((entry) => isDashboardPyramidCommunicationStatus(entry.status));
  const homologousPyramidCommunications = homologousPyramidCommunicationRows.filter((entry) => isDashboardPyramidCommunicationStatus(entry.status));
  const pyramidCounts = buildPyramidCounts(pyramidCommunications);
  const homologousPyramidCounts = homologousPyramidCommunications.length > 0
    ? buildPyramidCounts(homologousPyramidCommunications)
    : undefined;
  const homologousValidCommunications = homologousPyramidCommunications.filter((entry) => ["VALID_OPEN", "ONGOING", "CLOSED"].includes(entry.status));
  const pendingValidation = communicationRows.filter((entry) => ["SUBMITTED", "PENDING_VALIDATION"].includes(entry.status)).length;
  const openCommunications = communicationRows.filter((entry) => ["VALID_OPEN", "ONGOING"].includes(entry.status)).length;
  const myOpenActions = actionRows.filter(
    (entry) => entry.ownerUserId === session?.user.id && isDashboardOpenAction(entry),
  ).length;
  const backlogActions = backlogActionRows.filter((entry) => actionWasOpenAt(entry, backlogReferenceDate));
  const overdue = backlogActions.filter((entry) => isDashboardOverdueAction(entry, backlogReferenceDate)).length;
  const openActionsCount = actionRows.filter((entry) => entry.status === "OPEN").length;
  const closedActions = actionRows.filter((entry) => entry.status === "CLOSED").length;
  const actionsToClose = actionRows.filter(isDashboardOpenAction).length;
  const totalActions = actionRows.length;
  const closedActionsWithDates = actionRows.filter((entry) => entry.status === "CLOSED" && entry.closedAt && entry.dueDate);
  const closedOnTimePercent = closedActionsWithDates.length > 0
    ? (closedActionsWithDates.filter((entry) => entry.closedAt! <= entry.dueDate).length / closedActionsWithDates.length) * 100
    : null;
  const validCommunicationsCount = validCommunications.length;
  const nearMissCount = validCommunications.filter((entry) => entry.type === "NEAR_MISS").length;
  const unsafeActCount = validCommunications.filter((entry) => entry.type === "UNSAFE_ACT").length;
  const unsafeConditionCount = validCommunications.filter((entry) => entry.type === "UNSAFE_CONDITION").length;
  const injuryCount = validCommunications.filter((entry) => entry.type === "ACCIDENT").length;
  const firstAidCount = validCommunications.filter((entry) => entry.type === "FIRST_AID").length;
  const rootCauseCount = sewoRows.reduce((sum, entry) => sum + getSewoRootCauseCount(entry), 0);
  const homologousRootCauseCount = homologousSewoRows.reduce((sum, entry) => sum + getSewoRootCauseCount(entry), 0);
  const rootCauseTopEntries = buildSewoRootCauseTopEntries(sewoRows);
  const rootCauseRankingEntries = toRootCauseRankingEntries(rootCauseTopEntries, rootCauseCount);
  const unsafeActTypeTopEntries = buildCommunicationTypeTopEntries(validCommunications, CommunicationType.UNSAFE_ACT);
  const unsafeConditionTypeTopEntries = buildCommunicationTypeTopEntries(validCommunications, CommunicationType.UNSAFE_CONDITION);
  const nearMissTypeTopEntries = buildCommunicationTypeTopEntries(validCommunications, CommunicationType.NEAR_MISS);
  const unsafeActTypeTotal = getCommunicationTypeTotal(validCommunications, CommunicationType.UNSAFE_ACT);
  const unsafeConditionTypeTotal = getCommunicationTypeTotal(validCommunications, CommunicationType.UNSAFE_CONDITION);
  const nearMissTypeTotal = getCommunicationTypeTotal(validCommunications, CommunicationType.NEAR_MISS);
  const sifPsifIndicators = buildSifPsifIndicatorBreakdown(sifPsifIncidentRows);
  const homologousSifPsifIndicators = buildSifPsifIndicatorBreakdown(homologousSifPsifIncidentRows);
  const lostDays = validCommunications.reduce((sum, entry) => sum + (entry.lostDays ?? 0), 0);
  const closedActionsPercent = totalActions > 0 ? (closedActions / totalActions) * 100 : 0;
  const actionsToClosePercent = totalActions > 0 ? (actionsToClose / totalActions) * 100 : 0;
  const totalHoursWorked = hoursWorkedRows.reduce((sum, entry) => sum + Number(entry.hoursWorked ?? 0), 0);
  const homologousHoursWorked = homologousHoursWorkedRows.reduce((sum, entry) => sum + Number(entry.hoursWorked ?? 0), 0);
  const frequencyIndex = totalHoursWorked > 0 ? (injuryCount / totalHoursWorked) * 1_000_000 : 0;
  const severityIndex = totalHoursWorked > 0 ? (lostDays / totalHoursWorked) * 1_000_000 : 0;
  const firstAidRate = totalHoursWorked > 0 ? (firstAidCount / totalHoursWorked) * 1_000_000 : null;
  const homologousInjuryCount = homologousValidCommunications.filter((entry) => entry.type === "ACCIDENT").length;
  const homologousFirstAidCount = homologousValidCommunications.filter((entry) => entry.type === "FIRST_AID").length;
  const homologousLostDays = homologousValidCommunications.reduce((sum, entry) => sum + (entry.lostDays ?? 0), 0);
  const homologousFrequencyIndex = homologousHoursWorked > 0 ? (homologousInjuryCount / homologousHoursWorked) * 1_000_000 : null;
  const homologousSeverityIndex = homologousHoursWorked > 0 ? (homologousLostDays / homologousHoursWorked) * 1_000_000 : null;
  const homologousFirstAidRate = homologousHoursWorked > 0 ? (homologousFirstAidCount / homologousHoursWorked) * 1_000_000 : null;
  const unsafeActsClosedPercent = getLinkedCommunicationClosureRate(
    validCommunications.filter((entry) => entry.type === "UNSAFE_ACT"),
  );
  const unsafeConditionsClosedPercent = getLinkedCommunicationClosureRate(
    validCommunications.filter((entry) => entry.type === "UNSAFE_CONDITION"),
  );
  const homologousUnsafeActsClosedPercent = getLinkedCommunicationClosureRate(
    homologousValidCommunications.filter((entry) => entry.type === "UNSAFE_ACT"),
  );
  const homologousUnsafeConditionsClosedPercent = getLinkedCommunicationClosureRate(
    homologousValidCommunications.filter((entry) => entry.type === "UNSAFE_CONDITION"),
  );
  const hasHomologousCommunicationData = homologousPyramidCommunications.length > 0;
  const actionBacklogTrend = monthBuckets.map((bucket) => {
    const monthEnd = getMonthEnd(bucket.year, bucket.month);
    const referenceDate = monthEnd > backlogReferenceDate ? backlogReferenceDate : monthEnd;
    return {
      label: bucket.label,
      value: backlogActionRows.filter((entry) => actionWasOpenAt(entry, referenceDate)).length,
    };
  });
  const actionAgeing = backlogActions.reduce(
    (result, action) => {
      const ageDays = Math.max(0, Math.floor((backlogReferenceDate.getTime() - action.createdAt.getTime()) / (24 * 60 * 60 * 1000)));
      if (ageDays <= 30) result.recent += 1;
      else if (ageDays <= 60) result.aging += 1;
      else result.longRunning += 1;
      return result;
    },
    { recent: 0, aging: 0, longRunning: 0 },
  );
  const showDetailedKpis = hasSafetyDashboardDetailedReadAccess(actorRole);
  const showPendingValidationKpi = showDetailedKpis;
  const canViewOpenCommunications = Boolean(actorRole);
  const homologousComparisons = {
    validatedEvents: hasHomologousCommunicationData
      ? getHomologousTrend(validCommunicationsCount, homologousValidCommunications.length, ui.dashboard.samePeriodLastYearShort, uiLocale)
      : undefined,
    injuries: hasHomologousCommunicationData
      ? getHomologousTrend(injuryCount, homologousInjuryCount, ui.dashboard.samePeriodLastYearShort, uiLocale)
      : undefined,
    frequencyRate: homologousFrequencyIndex === null
      ? undefined
      : getHomologousTrend(frequencyIndex, homologousFrequencyIndex, ui.dashboard.samePeriodLastYearShort, uiLocale, 2),
    gravityRate: homologousSeverityIndex === null
      ? undefined
      : getHomologousTrend(severityIndex, homologousSeverityIndex, ui.dashboard.samePeriodLastYearShort, uiLocale, 2),
    daysLost: hasHomologousCommunicationData
      ? getHomologousTrend(lostDays, homologousLostDays, ui.dashboard.samePeriodLastYearShort, uiLocale)
      : undefined,
    firstAids: hasHomologousCommunicationData
      ? getHomologousTrend(firstAidCount, homologousFirstAidCount, ui.dashboard.samePeriodLastYearShort, uiLocale)
      : undefined,
    firstAidRate: homologousFirstAidRate === null || firstAidRate === null
      ? undefined
      : getHomologousTrend(firstAidRate, homologousFirstAidRate, ui.dashboard.samePeriodLastYearShort, uiLocale, 2),
    nearMisses: hasHomologousCommunicationData
      ? getHomologousTrend(nearMissCount, homologousValidCommunications.filter((entry) => entry.type === "NEAR_MISS").length, ui.dashboard.samePeriodLastYearShort, uiLocale)
      : undefined,
    unsafeActs: hasHomologousCommunicationData
      ? getHomologousTrend(unsafeActCount, homologousValidCommunications.filter((entry) => entry.type === "UNSAFE_ACT").length, ui.dashboard.samePeriodLastYearShort, uiLocale)
      : undefined,
    unsafeConditions: hasHomologousCommunicationData
      ? getHomologousTrend(unsafeConditionCount, homologousValidCommunications.filter((entry) => entry.type === "UNSAFE_CONDITION").length, ui.dashboard.samePeriodLastYearShort, uiLocale)
      : undefined,
    rootCauses: homologousSewoRows.length > 0
      ? getHomologousTrend(rootCauseCount, homologousRootCauseCount, ui.dashboard.samePeriodLastYearShort, uiLocale)
      : undefined,
    hoursWorked: homologousHoursWorked > 0
      ? getHomologousTrend(totalHoursWorked, homologousHoursWorked, ui.dashboard.samePeriodLastYearShort, uiLocale, 2)
      : undefined,
    unsafeActsClosedPercent: homologousUnsafeActsClosedPercent === null || unsafeActsClosedPercent === null
      ? undefined
      : getHomologousTrend(unsafeActsClosedPercent, homologousUnsafeActsClosedPercent, ui.dashboard.samePeriodLastYearShort, uiLocale, 1),
    unsafeConditionsClosedPercent: homologousUnsafeConditionsClosedPercent === null || unsafeConditionsClosedPercent === null
      ? undefined
      : getHomologousTrend(unsafeConditionsClosedPercent, homologousUnsafeConditionsClosedPercent, ui.dashboard.samePeriodLastYearShort, uiLocale, 1),
  };

  const sifPsifComparisons = {
    overall: homologousSifPsifIndicators.overall.total > 0
      ? getHomologousTrend(
          sifPsifIndicators.overall.sifOrPsifPercent ?? 0,
          homologousSifPsifIndicators.overall.sifOrPsifPercent ?? 0,
          ui.dashboard.samePeriodLastYearShort,
          uiLocale,
          1,
        )
      : undefined,
    byCategory: {
      FIRST_AID: homologousSifPsifIndicators.byCategory.FIRST_AID.total > 0
        ? getHomologousTrend(
            sifPsifIndicators.byCategory.FIRST_AID.sifOrPsifPercent ?? 0,
            homologousSifPsifIndicators.byCategory.FIRST_AID.sifOrPsifPercent ?? 0,
            ui.dashboard.samePeriodLastYearShort,
            uiLocale,
            1,
          )
        : undefined,
      NEAR_MISS: homologousSifPsifIndicators.byCategory.NEAR_MISS.total > 0
        ? getHomologousTrend(
            sifPsifIndicators.byCategory.NEAR_MISS.sifOrPsifPercent ?? 0,
            homologousSifPsifIndicators.byCategory.NEAR_MISS.sifOrPsifPercent ?? 0,
            ui.dashboard.samePeriodLastYearShort,
            uiLocale,
            1,
          )
        : undefined,
      ACCIDENT: homologousSifPsifIndicators.byCategory.ACCIDENT.total > 0
        ? getHomologousTrend(
            sifPsifIndicators.byCategory.ACCIDENT.sifOrPsifPercent ?? 0,
            homologousSifPsifIndicators.byCategory.ACCIDENT.sifOrPsifPercent ?? 0,
            ui.dashboard.samePeriodLastYearShort,
            uiLocale,
            1,
          )
        : undefined,
    },
  };

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
    increment(involvedLocations, row.workstation ? localizedWorkstationById.get(row.workstation.id) ?? row.workstation.name : null);

    const reporterEmployee = row.reporterEmployeeNo ? employeeByNo.get(row.reporterEmployeeNo) : null;
    increment(reportingDepartments, reporterEmployee?.dept);
  }

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
      higher: toCommunicationTypeRankingEntries(unsafeActTypeTopEntries, "unsafe-act-type", unsafeActTypeTotal),
      lower: [],
    },
    {
      id: "unsafe-condition-types-top",
      title: ui.dashboard.unsafeConditionTypeTopFive,
      variant: "percent",
      higher: toCommunicationTypeRankingEntries(unsafeConditionTypeTopEntries, "unsafe-condition-type", unsafeConditionTypeTotal),
      lower: [],
    },
    {
      id: "near-miss-types-top",
      title: ui.dashboard.nearMissTypeTopFive,
      variant: "percent",
      higher: toCommunicationTypeRankingEntries(nearMissTypeTopEntries, "near-miss-type", nearMissTypeTotal),
      lower: [],
    },
    {
      id: "workers-involved",
      title: ui.dashboard.workersInvolvedRanking,
      variant: "count",
      higher: buildTopEntries(involvedWorkers),
      lower: [],
    },
    {
      id: "workers-reporting",
      title: ui.dashboard.workersReportingRanking,
      variant: "count",
      higher: buildTopEntries(reportingWorkers),
      lower: [],
    },
    {
      id: "departments-involved",
      title: ui.dashboard.departmentsInvolvedRanking,
      variant: "count",
      higher: buildTopEntries(involvedDepartments),
      lower: [],
    },
    {
      id: "departments-reporting",
      title: ui.dashboard.departmentsReportingRanking,
      variant: "count",
      higher: buildTopEntries(reportingDepartments),
      lower: [],
    },
    {
      id: "locations-involved",
      title: ui.dashboard.locationsInvolvedRanking,
      variant: "count",
      higher: buildTopEntries(involvedLocations),
      lower: [],
    },
  ];

  const monthlyMetricsMap = new Map(
    monthBuckets.map((bucket) => [bucket.key, createEmptyMonthlyMetricSnapshot(bucket.key, bucket.label)]),
  );

  for (const row of validCommunications) {
    const key = getMonthKey(row.eventDatetime.getUTCFullYear(), row.eventDatetime.getUTCMonth() + 1);
    const snapshot = monthlyMetricsMap.get(key);
    if (!snapshot) continue;
    snapshot.validatedEvents += 1;
    if (row.type === "NEAR_MISS") snapshot.nearMisses += 1;
    if (row.type === "ACCIDENT") snapshot.injuries += 1;
    snapshot.lostDays += row.lostDays ?? 0;
  }

  for (const row of actionRows) {
    const key = getMonthKey(row.createdAt.getUTCFullYear(), row.createdAt.getUTCMonth() + 1);
    const snapshot = monthlyMetricsMap.get(key);
    if (!snapshot) continue;
    if (row.status === "OPEN") snapshot.openActions += 1;
    if (row.status === "CLOSED") snapshot.closedActions += 1;
    if (row.status === "OPEN" || row.status === "ONGOING") snapshot.actionsToClose += 1;
  }

  for (const row of sewoRows) {
    const key = getMonthKey(row.analysisDate.getUTCFullYear(), row.analysisDate.getUTCMonth() + 1);
    const snapshot = monthlyMetricsMap.get(key);
    if (!snapshot) continue;
    snapshot.rootCauses += getSewoRootCauseCount(row);
  }

  for (const row of hoursWorkedRows) {
    const key = getMonthKey(row.year, row.month);
    const snapshot = monthlyMetricsMap.get(key);
    if (!snapshot) continue;
    snapshot.hoursWorked += Number(row.hoursWorked ?? 0);
  }

  const monthlyMetrics = [...monthlyMetricsMap.values()].map((snapshot) => {
    const totalMonthlyActions = snapshot.openActions + snapshot.closedActions + Math.max(snapshot.actionsToClose - snapshot.openActions, 0);
    return {
      ...snapshot,
      closedActionsPercent: totalMonthlyActions > 0 ? (snapshot.closedActions / totalMonthlyActions) * 100 : 0,
      actionsToClosePercent: totalMonthlyActions > 0 ? (snapshot.actionsToClose / totalMonthlyActions) * 100 : 0,
      frequencyRate: snapshot.hoursWorked > 0 ? (snapshot.injuries / snapshot.hoursWorked) * 1_000_000 : 0,
      gravityRate: snapshot.hoursWorked > 0 ? (snapshot.lostDays / snapshot.hoursWorked) * 1_000_000 : 0,
    };
  });

  const rankingMonthlySeries: Record<string, RankingSeriesSnapshot[]> = Object.fromEntries(
    rankings.map((group) => [
      group.id,
      monthBuckets.map((bucket) => {
        if (group.id === "root-causes-top") {
          const monthSewoRows = sewoRows.filter(
            (row) => getMonthKey(row.analysisDate.getUTCFullYear(), row.analysisDate.getUTCMonth() + 1) === bucket.key,
          );

          return {
            monthKey: bucket.key,
            monthLabel: bucket.label,
            entries: toRootCauseRankingEntries(
              buildSewoRootCauseTopEntries(monthSewoRows),
              monthSewoRows.reduce((sum, entry) => sum + getSewoRootCauseCount(entry), 0),
            ),
          };
        }

        const monthRows = validCommunications.filter(
          (row) => getMonthKey(row.eventDatetime.getUTCFullYear(), row.eventDatetime.getUTCMonth() + 1) === bucket.key,
        );

        if (group.id === "unsafe-act-types-top") {
          return {
            monthKey: bucket.key,
            monthLabel: bucket.label,
            entries: toCommunicationTypeRankingEntries(
              buildCommunicationTypeTopEntries(monthRows, CommunicationType.UNSAFE_ACT),
              "unsafe-act-type",
              getCommunicationTypeTotal(monthRows, CommunicationType.UNSAFE_ACT),
            ),
          };
        }

        if (group.id === "unsafe-condition-types-top") {
          return {
            monthKey: bucket.key,
            monthLabel: bucket.label,
            entries: toCommunicationTypeRankingEntries(
              buildCommunicationTypeTopEntries(monthRows, CommunicationType.UNSAFE_CONDITION),
              "unsafe-condition-type",
              getCommunicationTypeTotal(monthRows, CommunicationType.UNSAFE_CONDITION),
            ),
          };
        }

        if (group.id === "near-miss-types-top") {
          return {
            monthKey: bucket.key,
            monthLabel: bucket.label,
            entries: toCommunicationTypeRankingEntries(
              buildCommunicationTypeTopEntries(monthRows, CommunicationType.NEAR_MISS),
              "near-miss-type",
              getCommunicationTypeTotal(monthRows, CommunicationType.NEAR_MISS),
            ),
          };
        }

        const monthMap = new Map<string, number>();

        for (const row of monthRows) {
          if (group.id === "workers-involved") {
            increment(monthMap, row.targetEmployee?.name ?? row.targetText);
          } else if (group.id === "workers-reporting") {
            const reporterEmployee = row.reporterEmployeeNo ? employeeByNo.get(row.reporterEmployeeNo) : null;
            increment(monthMap, reporterEmployee ? `${reporterEmployee.employeeNo} - ${reporterEmployee.name}` : row.reporterEmployeeNo);
          } else if (group.id === "departments-involved") {
            increment(monthMap, row.targetEmployee?.dept);
          } else if (group.id === "departments-reporting") {
            const reporterEmployee = row.reporterEmployeeNo ? employeeByNo.get(row.reporterEmployeeNo) : null;
            increment(monthMap, reporterEmployee?.dept);
          } else if (group.id === "locations-involved") {
            increment(monthMap, row.workstation ? localizedWorkstationById.get(row.workstation.id) ?? row.workstation.name : null);
          }
        }

        return {
          monthKey: bucket.key,
          monthLabel: bucket.label,
          entries: buildTopEntries(monthMap),
        };
      }),
    ]),
  );

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
    rootCauseCount,
    frequencyIndex,
    severityIndex,
    safetyDays,
    communicationPyramid: pyramidCounts,
    leaders: [],
    monthlyMetrics,
  };
  const yearOptions = buildYearOptions({
    currentYear: new Date().getUTCFullYear(),
    communicationMin: communicationDateRange._min.eventDatetime,
    communicationMax: communicationDateRange._max.eventDatetime,
    monthlyMinYear: monthlyYearRange._min.year,
    monthlyMaxYear: monthlyYearRange._max.year,
  });
  const monthOptions = [
    { value: "1", label: getMonthLabel(uiLocale, 0) },
    { value: "2", label: getMonthLabel(uiLocale, 1) },
    { value: "3", label: getMonthLabel(uiLocale, 2) },
    { value: "4", label: getMonthLabel(uiLocale, 3) },
    { value: "5", label: getMonthLabel(uiLocale, 4) },
    { value: "6", label: getMonthLabel(uiLocale, 5) },
    { value: "7", label: getMonthLabel(uiLocale, 6) },
    { value: "8", label: getMonthLabel(uiLocale, 7) },
    { value: "9", label: getMonthLabel(uiLocale, 8) },
    { value: "10", label: getMonthLabel(uiLocale, 9) },
    { value: "11", label: getMonthLabel(uiLocale, 10) },
    { value: "12", label: getMonthLabel(uiLocale, 11) },
  ];

  return (
    <>
      <div data-onboarding="dashboard-overview">
        <AppHero
          eyebrow={ui.modules.safetyDashboard}
          title={ui.dashboard.plantTitle}
          description={ui.dashboard.plantDescription}
          helpLabel={ui.dashboard.help}
        />
      </div>

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
            <Link href={`/app/${plant}/dashboards`} className="app-toolbar h-11 min-w-[118px] whitespace-nowrap px-4">
              {ui.dashboard.clearDates}
            </Link>
            <Link href={`/app/${plant}/dashboards`} className="app-toolbar h-11 min-w-[108px] whitespace-nowrap px-4">
              {ui.dashboard.currentYear}
            </Link>
          </div>
        </form>
      </section>

      <SafetyDaysSpotlight plantName={plantRow.name} summary={safetyDays} labels={ui.dashboard} />

      <SafetyCommunicationPyramid
        title={ui.dashboard.safetyCommunicationPyramid}
        counts={pyramidCounts}
        previousCounts={homologousPyramidCounts}
        locale={uiLocale}
        scopeLabel={plantRow.name}
        periodLabel={period.label}
        classificationRule={ui.dashboard.pyramidClassificationRule}
        hierarchyLabel={ui.dashboard.pyramidHierarchyNote}
        emptyLabel={ui.dashboard.pyramidEmptyState}
        previousPeriodLabel={ui.dashboard.samePeriodLastYearShort}
        helpLabel={ui.dashboard.help}
        labels={{
          fatal: ui.dashboard.pyramidFatal,
          seriousInjury: ui.dashboard.pyramidSeriousInjury,
          minorInjury: ui.dashboard.pyramidMinorInjury,
          firstAid: ui.dashboard.pyramidFirstAid,
          nearMiss: ui.dashboard.pyramidNearMiss,
          unsafeCondition: ui.dashboard.pyramidUnsafeCondition,
          unsafeAct: ui.dashboard.pyramidUnsafeAct,
        }}
      />

      <SafetyDashboardKpiGroups
        locale={uiLocale}
        periodLabel={period.label}
        labels={ui.dashboard}
        detailed={showDetailedKpis}
        showPendingValidationKpi={showPendingValidationKpi}
        canViewOpenCommunications={canViewOpenCommunications}
        metrics={{
          validatedEvents: validCommunicationsCount,
          injuries: injuryCount,
          daysLost: lostDays,
          firstAids: firstAidCount,
          frequencyRate: totalHoursWorked > 0 ? frequencyIndex : null,
          gravityRate: totalHoursWorked > 0 ? severityIndex : null,
          firstAidRate,
          nearMisses: nearMissCount,
          unsafeActs: unsafeActCount,
          unsafeConditions: unsafeConditionCount,
          rootCauses: rootCauseCount,
          openActions: backlogActions.length,
          overdueActions: overdue,
          closedOnTimePercent,
          unsafeActsClosedPercent,
          unsafeConditionsClosedPercent,
          pendingValidation,
          openCommunications,
          myOpenActions,
          hoursWorked: hoursWorkedRows.length > 0 ? totalHoursWorked : null,
          comparisons: homologousComparisons,
          backlog: {
            total: backlogActions.length,
            trend: actionBacklogTrend,
            ageing: actionAgeing,
          },
          sifPsif: {
            plantName: plantRow.name,
            current: sifPsifIndicators,
            comparisons: sifPsifComparisons,
          },
          competences: competenceCoverage ? {
            coveragePercent: competenceCoverage.coveragePercent,
            expiredCount: competenceCoverage.expiredCount,
          } : undefined,
          fireEquipment: fireEquipmentCoverage ? {
            coveragePercent: fireEquipmentCoverage.coveragePercent,
            problemCount: fireEquipmentCoverage.problemCount,
          } : undefined,
        }}
      />

      {showDetailedKpis ? <section className="grid gap-4 xl:grid-cols-4">
        <RootCauseTopFiveCard
          title={ui.dashboard.rootCauseTopFive}
          entries={rootCauseTopEntries}
          total={rootCauseCount}
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
      </section> : null}

      {showDetailedKpis ? (
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
          totalRootCauses={plantBenchmarkSummary.rootCauseCount}
          totalFrequencyIndex={plantBenchmarkSummary.frequencyIndex}
          totalSeverityIndex={plantBenchmarkSummary.severityIndex}
          totalCommunicationPyramid={plantBenchmarkSummary.communicationPyramid}
          rankings={rankings}
          rankingMonthlySeries={rankingMonthlySeries}
          title={ui.dashboard.plantIndicators}
          pyramidDescription={ui.dashboard.plantPyramidDescription}
          storageKeyBase={`ma-hse-plant-${plantRow.code}`}
          initialActivePlantCode={plantRow.code}
          hidePlantList
          hidePyramid
          hideFavoriteMetrics
          showCreatePlantLink={false}
          rootCauseMetricLabel={ui.dashboard.sewoRootCauses}
          labels={ui.dashboard}
        />
      ) : null}
    </>
  );
}
