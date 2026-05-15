import type { SafetyDaysSummary } from "@/lib/safety-days";

export type MonthlyMetricSnapshot = {
  monthKey: string;
  monthLabel: string;
  validatedEvents: number;
  openActions: number;
  closedActions: number;
  actionsToClose: number;
  closedActionsPercent: number;
  actionsToClosePercent: number;
  nearMisses: number;
  injuries: number;
  rootCauses: number;
  frequencyRate: number;
  gravityRate: number;
  hoursWorked: number;
  lostDays: number;
};

export type PlantSummary = {
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
  rootCauseCount: number;
  frequencyIndex: number;
  severityIndex: number;
  safetyDays: SafetyDaysSummary;
  communicationPyramid: {
    unsafeAct: number;
    unsafeCondition: number;
    nearMiss: number;
    firstAid: number;
    minorInjury: number;
    seriousInjury: number;
    fatal: number;
  };
  leaders: Array<{
    role: string;
    email: string | null;
    name: string;
  }>;
  monthlyMetrics: MonthlyMetricSnapshot[];
};

export type RankingEntry = {
  plantCode: string;
  plantName: string;
  value: number;
};

export type RankingGroup = {
  id: string;
  title: string;
  variant: "count" | "percent" | "index";
  higherLabel?: string;
  lowerLabel?: string;
  higher: RankingEntry[];
  lower: RankingEntry[];
};

export type RankingSeriesSnapshot = {
  monthKey: string;
  monthLabel: string;
  entries: RankingEntry[];
};

export function buildMonthBuckets(from: Date, to: Date) {
  const buckets: Array<{
    key: string;
    label: string;
    year: number;
    month: number;
  }> = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const last = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));

  while (cursor <= last) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    buckets.push({
      key: `${year}-${String(month).padStart(2, "0")}`,
      label: cursor.toLocaleString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }),
      year,
      month,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return buckets;
}

export function createEmptyMonthlyMetricSnapshot(monthKey: string, monthLabel: string): MonthlyMetricSnapshot {
  return {
    monthKey,
    monthLabel,
    validatedEvents: 0,
    openActions: 0,
    closedActions: 0,
    actionsToClose: 0,
    closedActionsPercent: 0,
    actionsToClosePercent: 0,
    nearMisses: 0,
    injuries: 0,
    rootCauses: 0,
    frequencyRate: 0,
    gravityRate: 0,
    hoursWorked: 0,
    lostDays: 0,
  };
}
