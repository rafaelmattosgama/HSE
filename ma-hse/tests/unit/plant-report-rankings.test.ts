import { CommunicationType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildPlantReportRankings, type PlantReportRankingInput } from "@/lib/plant-report-rankings";
import { buildCorporateSafetyReportData } from "@/lib/services/corporate-safety-report";

const from = new Date("2026-01-01T00:00:00Z");
const to = new Date("2026-09-30T23:59:59.999Z");
const row = {
  plantId: "a", status: "CLOSED", type: CommunicationType.UNSAFE_ACT, eventDatetime: to,
  unsafeActType: { name: "Procedure not followed" }, reporterEmployeeNo: "7", targetText: null,
  targetEmployee: { name: "Involved worker", dept: "Assembly" }, workstation: { name: "Press 1" },
};
const employees = [
  { plantId: "a", employeeNo: "7", name: "Reporter A", dept: "Quality" },
  { plantId: "b", employeeNo: "7", name: "Reporter B", dept: "Other plant" },
];
const build = (input: Partial<PlantReportRankingInput> = {}) => buildPlantReportRankings({ communications: [], analyses: [], employees, ...input }, "a", from, to);

describe("plant report rankings", () => {
  it("uses only validated events of the selected plant within the YTD boundaries", () => {
    const result = build({ communications: [row, { ...row, eventDatetime: from }, { ...row, plantId: "b" }, { ...row, status: "PENDING_VALIDATION" }, { ...row, status: "INVALID" }, { ...row, eventDatetime: new Date("2026-10-01") }] });
    expect(result.paretos[1]).toMatchObject({ total: 2, entries: [{ label: "Procedure not followed", count: 2, percentage: 100 }] });
    expect(result.people.map(ranking => ranking.total)).toEqual([2, 2, 2, 2, 2]);
    expect(result.people[1].entries[0].label).toBe("7 - Reporter A");
    expect(result.people[3].entries[0].label).toBe("Quality");
  });

  it("keeps the full denominator when showing only five categories or missing type classifications", () => {
    const communications = Array.from({ length: 6 }, (_, i) => ({ ...row, unsafeActType: { name: `Type ${i}` }, targetEmployee: { name: `Worker ${i}`, dept: "Assembly" } }));
    const result = build({ communications: [...communications, { ...row, unsafeActType: null, targetEmployee: null }] });
    expect(result.paretos[1].total).toBe(7);
    expect(result.paretos[1].entries).toHaveLength(5);
    expect(result.paretos[1].entries[0].percentage).toBeCloseTo(100 / 7);
    expect(result.people[0].total).toBe(6);
    expect(result.people[0].entries).toHaveLength(5);
    expect(result.people[0].entries[0].percentage).toBeCloseTo(100 / 6);
  });

  it("matches dashboard root-cause extraction and excludes deleted, foreign and out-of-period analyses", () => {
    const analysis = { plantId: "a", analysisDate: from, deletedAt: null, templateData: { rootCauseDetails: [{ label: "Cause A", isRootCause: true }, { label: "Not a root cause", isRootCause: false }] }, causeSelections: [{ selected: true, isRootCause: true, causeItem: { label: "Cause A" } }] };
    const result = build({ analyses: [analysis, { ...analysis, plantId: "b" }, { ...analysis, deletedAt: to }, { ...analysis, analysisDate: new Date("2025-12-31") }] });
    expect(result.paretos[0]).toMatchObject({ total: 1, entries: [{ label: "Cause A", count: 1, percentage: 100 }] });
  });

  it("preserves target text and employee-number fallbacks without inventing departments", () => {
    const result = build({ communications: [{ ...row, targetEmployee: null, targetText: "External worker", reporterEmployeeNo: "unknown", workstation: null }] });
    expect(result.people[0].entries[0].label).toBe("External worker");
    expect(result.people[1].entries[0].label).toBe("unknown");
    expect(result.people.slice(2).map(ranking => ranking.total)).toEqual([0, 0, 0]);
    expect(build().paretos.every(ranking => ranking.entries.length === 0)).toBe(true);
  });
});

describe("factory report scope", () => {
  it("filters KPI, communication, closure, action and historical totals to the selected plant", () => {
    const result = buildCorporateSafetyReportData({
      plants: [{ id: "a", code: "A", name: "Plant A" }, { id: "b", code: "B", name: "Plant B" }],
      selectedPlantId: "a", scopeLabel: "Factory: Plant A", selectedYear: 2026, selectedMonth: 9,
      communications: [
        { ...row, status: "CLOSED", lostDays: 3, reportedAt: to, actions: [] },
        { ...row, plantId: "b", status: "CLOSED", lostDays: 90, reportedAt: to, actions: [] },
      ],
      kpiInputs: [{ plantId: "a", year: 2026, month: 9, hoursWorked: 1000 }, { plantId: "b", year: 2026, month: 9, hoursWorked: 99000 }],
      communicationStatusCounts: [{ plantId: "a", status: "SUBMITTED", count: 2 }, { plantId: "b", status: "SUBMITTED", count: 30 }],
      actions: [{ plantId: "b", status: "OPEN", createdAt: from, dueDate: to, closedAt: null }],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.division).toMatchObject({ hoursYtd: 1000, lostDaysYtd: 3 });
    expect(result.division.communicationsYtd).toMatchObject({ closed: 1, valid: 1 });
    expect(result.operational).toMatchObject({ openActions: 0, pendingValidations: 2 });
    expect(result.series.yearlyComparison.at(-1)?.hoursWorked).toBe(1000);
    expect(result.plantRankings?.plantId).toBe("a");
  });

  it("does not infer factory scope from a global report with one active plant", () => {
    const input = { plants: [{ id: "a", code: "A", name: "Plant A" }], communications: [], kpiInputs: [], selectedYear: 2026, selectedMonth: 9, scopeLabel: "Global" };
    expect(buildCorporateSafetyReportData(input).plant).toBeNull();
    expect(() => buildCorporateSafetyReportData({ ...input, selectedPlantId: "missing" })).toThrow("Selected report plant");
    expect(() => buildCorporateSafetyReportData({ ...input, selectedPlantId: "a", plantRankings: { ...build(), plantId: "b" } })).toThrow("Ranking data");
  });
});
