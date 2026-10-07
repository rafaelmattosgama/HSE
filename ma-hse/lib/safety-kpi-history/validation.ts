import { Prisma, SafetyKpiHistorySource } from "@prisma/client";

export const SAFETY_KPI_RATE_FACTOR = new Prisma.Decimal(1_000_000);
export const SAFETY_KPI_RATE_WARNING_TOLERANCE = new Prisma.Decimal("0.1");

export type NormalizedSafetyKpiRow = {
  plantCode: string;
  year: number;
  month: number;
  hoursWorked: string;
  employees: number;
  accidents: number;
  lostDays: string;
  seriousInjury: number;
  minorInjury: number;
  firstAids: number;
  nearMiss: number;
  unsafeCondition: number;
  unsafeAct: number;
  sourceFrequencyRate: string | null;
  sourceGravityRate: string | null;
  source: SafetyKpiHistorySource;
  notes: string | null;
};

export type SafetyKpiCalculatedRates = { frequencyRate: string; gravityRate: string };

function decimal(value: unknown, label: string, errors: string[], nullable = false) {
  if ((value === null || value === undefined || String(value).trim() === "") && nullable) return null;
  try {
    const result = new Prisma.Decimal(String(value).trim().replace(",", "."));
    if (result.isNegative()) errors.push(`${label} must be greater than or equal to 0`);
    return result.toString();
  } catch {
    errors.push(`${label} must be numeric`);
    return nullable ? null : "0";
  }
}

function integer(value: unknown, label: string, errors: string[]) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isInteger(parsed)) {
    errors.push(`${label} must be an integer`);
    return 0;
  }
  if (parsed < 0) errors.push(`${label} must be greater than or equal to 0`);
  return parsed;
}

export function calculateSafetyKpiRates(row: Pick<NormalizedSafetyKpiRow, "hoursWorked" | "accidents" | "lostDays">): SafetyKpiCalculatedRates {
  const hours = new Prisma.Decimal(row.hoursWorked);
  if (hours.isZero()) return { frequencyRate: "0", gravityRate: "0" };
  return {
    frequencyRate: new Prisma.Decimal(row.accidents).mul(SAFETY_KPI_RATE_FACTOR).div(hours).toDecimalPlaces(10).toString(),
    gravityRate: new Prisma.Decimal(row.lostDays).mul(SAFETY_KPI_RATE_FACTOR).div(hours).toDecimalPlaces(10).toString(),
  };
}

export function normalizeAndValidateSafetyKpiRow(raw: Record<string, unknown>) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const plantCode = String(raw.plant ?? "").trim().toLowerCase();
  if (!plantCode) errors.push("Plant is required");
  const year = integer(raw.year, "Year", errors);
  if (year < 1900 || year > 2200) errors.push("Year must be between 1900 and 2200");
  const month = integer(raw.month, "Month", errors);
  if (month < 1 || month > 12) errors.push("Month must be between 1 and 12");
  const hoursWorked = decimal(raw.hoursWorked, "Hours Worked", errors) ?? "0";
  const employees = integer(raw.employees, "Employees", errors);
  const accidents = integer(raw.accidents, "Accidents", errors);
  const lostDays = decimal(raw.lostDays, "Lost Days", errors) ?? "0";
  const seriousInjury = integer(raw.seriousInjury, "Serious Injury", errors);
  const minorInjury = integer(raw.minorInjury, "Minor Injury", errors);
  const firstAids = integer(raw.firstAids, "First Aids", errors);
  const nearMiss = integer(raw.nearMiss, "Near Miss", errors);
  const unsafeCondition = integer(raw.unsafeCondition, "Unsafe Condition", errors);
  const unsafeAct = integer(raw.unsafeAct, "Unsafe Act", errors);
  const sourceFrequencyRate = decimal(raw.sourceFrequencyRate, "Frequency Rate (Source)", errors, true);
  const sourceGravityRate = decimal(raw.sourceGravityRate, "Gravity Rate (Source)", errors, true);
  const sourceText = String(raw.source ?? "HISTORICAL_IMPORT").trim().toUpperCase().replaceAll(" ", "_");
  const sourceIsValid = Object.values(SafetyKpiHistorySource).includes(sourceText as SafetyKpiHistorySource);
  if (!sourceIsValid) errors.push(`Source must be one of: ${Object.values(SafetyKpiHistorySource).join(", ")}`);
  const source = sourceIsValid
    ? sourceText as SafetyKpiHistorySource
    : SafetyKpiHistorySource.HISTORICAL_IMPORT;
  if (new Prisma.Decimal(hoursWorked).isZero() && (accidents > 0 || !new Prisma.Decimal(lostDays).isZero())) {
    errors.push("Hours Worked cannot be 0 when Accidents or Lost Days are greater than 0");
  }
  if (accidents !== seriousInjury + minorInjury) warnings.push("Accidents differs from Serious Injury + Minor Injury");
  const normalized: NormalizedSafetyKpiRow = {
    plantCode, year, month, hoursWorked, employees, accidents, lostDays, seriousInjury, minorInjury,
    firstAids, nearMiss, unsafeCondition, unsafeAct, sourceFrequencyRate, sourceGravityRate, source,
    notes: String(raw.notes ?? "").trim() || null,
  };
  const calculated = calculateSafetyKpiRates(normalized);
  if (sourceFrequencyRate !== null && new Prisma.Decimal(sourceFrequencyRate).sub(calculated.frequencyRate).abs().gt(SAFETY_KPI_RATE_WARNING_TOLERANCE)) {
    warnings.push("Frequency Rate (Source) differs from the calculated rate by more than 0.1");
  }
  if (sourceGravityRate !== null && new Prisma.Decimal(sourceGravityRate).sub(calculated.gravityRate).abs().gt(SAFETY_KPI_RATE_WARNING_TOLERANCE)) {
    warnings.push("Gravity Rate (Source) differs from the calculated rate by more than 0.1");
  }
  return { normalized, calculated, errors, warnings };
}

export function safetyKpiRecordKey(row: Pick<NormalizedSafetyKpiRow, "plantCode" | "year" | "month">) {
  return `${row.plantCode.toUpperCase()}|${row.year}-${String(row.month).padStart(2, "0")}`;
}
