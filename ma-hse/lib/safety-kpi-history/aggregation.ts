import { Prisma } from "@prisma/client";
import { calculateSafetyKpiRates } from "@/lib/safety-kpi-history/validation";

export type SafetyKpiMonth = {
  plantId: string; plantCode: string; year: number; month: number; source: "LIVE" | "HISTORICAL";
  hoursWorked: string; employees: number; accidents: number; lostDays: string; seriousInjury: number;
  minorInjury: number; firstAids: number; nearMiss: number; unsafeCondition: number; unsafeAct: number;
};

export function mergeSafetyKpiSources(live: SafetyKpiMonth[], historical: SafetyKpiMonth[]) {
  const result = new Map<string, SafetyKpiMonth>();
  for (const row of historical) result.set(`${row.plantId}|${row.year}-${row.month}`, row);
  // Live is canonical for an entire plant-month. Never add imported totals to it.
  for (const row of live) result.set(`${row.plantId}|${row.year}-${row.month}`, row);
  return [...result.values()].sort((a, b) => a.year - b.year || a.month - b.month || a.plantCode.localeCompare(b.plantCode));
}

export function aggregateSafetyKpiMonths(months: SafetyKpiMonth[]) {
  const hoursWorked = months.reduce((sum, row) => sum.add(row.hoursWorked), new Prisma.Decimal(0));
  const lostDays = months.reduce((sum, row) => sum.add(row.lostDays), new Prisma.Decimal(0));
  const sum = (key: keyof Pick<SafetyKpiMonth, "accidents" | "seriousInjury" | "minorInjury" | "firstAids" | "nearMiss" | "unsafeCondition" | "unsafeAct">) => months.reduce((total, row) => total + row[key], 0);
  const employees = months.length ? new Prisma.Decimal(months.reduce((total, row) => total + row.employees, 0)).div(months.length).toDecimalPlaces(10).toString() : "0";
  const accidents = sum("accidents");
  const calculated = calculateSafetyKpiRates({ hoursWorked: hoursWorked.toString(), accidents, lostDays: lostDays.toString() });
  return {
    months: months.length, throughMonth: months.reduce((max, row) => Math.max(max, row.month), 0),
    hoursWorked: hoursWorked.toString(), employees, accidents, lostDays: lostDays.toString(),
    seriousInjury: sum("seriousInjury"), minorInjury: sum("minorInjury"), firstAids: sum("firstAids"),
    nearMiss: sum("nearMiss"), unsafeCondition: sum("unsafeCondition"), unsafeAct: sum("unsafeAct"),
    frequencyRate: calculated.frequencyRate, gravityRate: calculated.gravityRate,
  };
}

export function compareSafetyKpiYears(months: SafetyKpiMonth[], year: number, compareTo = year - 1) {
  const currentRows = months.filter(row => row.year === year);
  const throughMonth = currentRows.reduce((max, row) => Math.max(max, row.month), 0);
  const previousRows = months.filter(row => row.year === compareTo && row.month <= throughMonth);
  const current = aggregateSafetyKpiMonths(currentRows);
  const previous = aggregateSafetyKpiMonths(previousRows);
  const comparison = Object.fromEntries([
    "hoursWorked", "employees", "accidents", "lostDays", "seriousInjury", "minorInjury", "firstAids", "nearMiss",
    "unsafeCondition", "unsafeAct", "frequencyRate", "gravityRate",
  ].map(key => {
    const currentValue = Number(current[key as keyof typeof current]);
    const previousValue = Number(previous[key as keyof typeof previous]);
    return [key, { absolute: currentValue - previousValue, percent: previousValue === 0 ? null : (currentValue - previousValue) / previousValue * 100 }];
  }));
  return { year, compareTo, throughMonth, current, previous, comparison };
}
