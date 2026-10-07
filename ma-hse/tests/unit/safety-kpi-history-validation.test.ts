import { describe, expect, it } from "vitest";
import { calculateSafetyKpiRates, normalizeAndValidateSafetyKpiRow } from "@/lib/safety-kpi-history/validation";

function row(overrides: Record<string, unknown> = {}) {
  return { plant: "MAAP", year: 2026, month: 1, hoursWorked: 100000, employees: 120, accidents: 1, lostDays: 2, seriousInjury: 1, minorInjury: 0, firstAids: 0, nearMiss: 0, unsafeCondition: 0, unsafeAct: 0, sourceFrequencyRate: 10, sourceGravityRate: 20, source: "Historical Import", ...overrides };
}

describe("historical safety KPI row validation", () => {
  it.each([0, 13])("rejects month %s", month => expect(normalizeAndValidateSafetyKpiRow(row({ month })).errors).toContain("Month must be between 1 and 12"));
  it.each(["hoursWorked", "employees", "accidents", "lostDays", "seriousInjury", "minorInjury", "firstAids", "nearMiss", "unsafeCondition", "unsafeAct"])("rejects a negative %s", field => {
    expect(normalizeAndValidateSafetyKpiRow(row({ [field]: -1 })).errors.some(error => error.includes("greater than or equal to 0"))).toBe(true);
  });
  it("rejects incidents with zero worked hours", () => {
    expect(normalizeAndValidateSafetyKpiRow(row({ hoursWorked: 0 })).errors).toContain("Hours Worked cannot be 0 when Accidents or Lost Days are greater than 0");
  });
  it("calculates rates with the confirmed 1,000,000 factor", () => {
    expect(calculateSafetyKpiRates({ hoursWorked: "200000", accidents: 2, lostDays: "64" })).toEqual({ frequencyRate: "10", gravityRate: "320" });
  });
  it("warns about source-rate drift and inconsistent accident classification", () => {
    const result = normalizeAndValidateSafetyKpiRow(row({ sourceFrequencyRate: 12, accidents: 2, seriousInjury: 0, minorInjury: 1 }));
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.stringContaining("Frequency Rate"), expect.stringContaining("Serious Injury") ]));
  });
});
