import { describe, expect, it } from "vitest";
import { aggregateSafetyKpiMonths, compareSafetyKpiYears, mergeSafetyKpiSources, type SafetyKpiMonth } from "@/lib/safety-kpi-history/aggregation";

function month(year: number, value: Partial<SafetyKpiMonth> = {}): SafetyKpiMonth {
  return { plantId: "p1", plantCode: "MAAP", year, month: 1, source: "HISTORICAL", hoursWorked: "100", employees: 100, accidents: 0, lostDays: "0", seriousInjury: 0, minorInjury: 0, firstAids: 0, nearMiss: 0, unsafeCondition: 0, unsafeAct: 0, ...value };
}

describe("historical safety KPI aggregation", () => {
  it("sums counts/hours, averages employees and recalculates annual rates", () => {
    const result = aggregateSafetyKpiMonths([month(2025, { hoursWorked: "100000", employees: 100, accidents: 1, lostDays: "20" }), month(2025, { month: 2, hoursWorked: "100000", employees: 140, accidents: 1, lostDays: "44" })]);
    expect(result).toMatchObject({ hoursWorked: "200000", employees: "120", accidents: 2, lostDays: "64", frequencyRate: "10", gravityRate: "320" });
  });
  it("compares a partial year with the same months of the previous year", () => {
    const rows = [1, 2, 3, 4, 5].map(index => month(2026, { month: index, hoursWorked: "10" }))
      .concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(index => month(2025, { month: index, hoursWorked: "20" })));
    const result = compareSafetyKpiYears(rows, 2026, 2025);
    expect(result.throughMonth).toBe(5);
    expect(result.current.hoursWorked).toBe("50");
    expect(result.previous.hoursWorked).toBe("100");
  });
  it("uses live rows instead of adding historical values for the same plant-month", () => {
    const historical = month(2025, { accidents: 9, hoursWorked: "100" });
    const live = month(2025, { source: "LIVE", accidents: 1, hoursWorked: "200" });
    expect(mergeSafetyKpiSources([live], [historical])).toEqual([live]);
  });
  it("recalculates group rates from summed numerators and denominators", () => {
    const aggregate = aggregateSafetyKpiMonths([month(2025, { plantId: "a", hoursWorked: "100000", accidents: 1 }), month(2025, { plantId: "b", hoursWorked: "900000", accidents: 9 })]);
    expect(aggregate.frequencyRate).toBe("10");
  });
});
