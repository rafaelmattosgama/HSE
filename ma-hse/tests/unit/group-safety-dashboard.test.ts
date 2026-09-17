import { describe, expect, it } from "vitest";
import { buildGroupSafetyPlant, calculateSafetyRates, emptySafetyTotals, groupSafetyHref, resolveGroupSafetyView, selectGroupSafetyPlants, summarizeGroupSafety, topSafetyDistribution, type GroupSafetyRawPlant } from "@/lib/group-safety-dashboard";

const from = new Date("2026-01-01T00:00:00Z");
const to = new Date("2026-01-31T23:59:59Z");
const today = new Date("2026-03-10T12:00:00Z");
const options = { from, to, today, injuryDates: [], safetyConfig: null };
function event(type = "ACCIDENT", status = "CLOSED", date = "2026-01-10T12:00:00Z") {
  return { type, status, classification: "MINOR", eventDatetime: new Date(date), reportedAt: new Date(date), lostDays: 2, updatedAt: today, unsafeActType: null, nearMissType: null };
}
function raw(code: string, hours = 100, accidents = 1): GroupSafetyRawPlant {
  return { id: code, code, name: code.toUpperCase(), createdAt: from, communications: Array.from({ length: accidents }, () => event()), kpiInputs: [{ year: 2026, month: 1, hoursWorked: hours, updatedAt: today }], sewoRecords: [], actions: [] };
}

describe("group safety shared calculations", () => {
  it("calculates weighted group rates from totals, never the mean of plant rates", () => {
    const plants = [buildGroupSafetyPlant(raw("a", 100, 1), options), buildGroupSafetyPlant(raw("b", 900, 3), options)];
    const summary = summarizeGroupSafety(plants, today.toISOString());
    expect(summary.current.accidents).toBe(4);
    expect(summary.rates.frequency).toBe(4000);
    expect(summary.rates.gravity).toBe(8000);
    expect(summary.months[0].rates.frequency).toBe(4000);
    expect(summary.rates.frequency).not.toBe((plants[0].rates.frequency! + plants[1].rates.frequency!) / 2);
  });

  it("excludes plants without a positive denominator only from rate rankings and flags incomplete exposure", () => {
    const plants = [buildGroupSafetyPlant(raw("a", 100, 1), options), buildGroupSafetyPlant(raw("b", 0, 3), options)];
    const summary = summarizeGroupSafety(plants, today.toISOString());
    expect(plants[1].rates.frequency).toBeNull();
    expect(summary.frequencyRanking.map(row => row.plantCode)).toEqual(["a"]);
    expect(summary.accidentRanking.map(row => row.plantCode)).toEqual(["b", "a"]);
    expect(summary.missingHours.map(plant => plant.code)).toEqual(["b"]);
    expect(summary.rates.frequency).toBe(40000);
    expect(calculateSafetyRates(emptySafetyTotals())).toEqual({ frequency: null, gravity: null, firstAid: null, nearMiss: null });
  });

  it("preserves eligible statuses and separates provisional pyramid records from KPI events", () => {
    const plant = raw("a", 1000, 0);
    plant.communications = [event("ACCIDENT", "VALID_OPEN"), event("FIRST_AID", "ONGOING"), event("NEAR_MISS", "CLOSED"), event("ACCIDENT", "SUBMITTED"), event("ACCIDENT", "INVALID"), event("ACCIDENT", "DRAFT")];
    const result = buildGroupSafetyPlant(plant, options);
    expect(result.current).toMatchObject({ accidents: 1, firstAids: 1, nearMisses: 1, lostDays: 6, events: 3 });
    expect(result.rates).toEqual({ frequency: 1000, gravity: 6000, firstAid: 1000, nearMiss: 1000 });
    expect(result.pyramid.minorInjury).toBe(2);
  });

  it("uses event dates for counts, report dates for pending pyramid records and whole-month hours in a custom range", () => {
    const plant = raw("a", 1000, 0);
    const pending = event("ACCIDENT", "PENDING_VALIDATION", "2025-12-20T12:00:00Z");
    pending.reportedAt = new Date("2026-01-15T12:00:00Z");
    plant.communications = [pending, event("ACCIDENT", "CLOSED", "2026-01-10T12:00:00Z"), event("ACCIDENT", "CLOSED", "2026-01-15T12:00:00Z")];
    const result = buildGroupSafetyPlant(plant, { ...options, from: new Date("2026-01-14T00:00:00Z"), to: new Date("2026-01-16T23:59:59Z") });
    expect(result.current.accidents).toBe(1);
    expect(result.current.hours).toBe(1000);
    expect(result.pyramid.minorInjury).toBe(2);
  });

  it("calculates the prior-year rates using prior-year events and hours", () => {
    const plant = raw("a", 1000, 2);
    plant.communications.push(event("ACCIDENT", "CLOSED", "2025-01-10T12:00:00Z"));
    plant.kpiInputs.push({ year: 2025, month: 1, hoursWorked: 500, updatedAt: today });
    const summary = summarizeGroupSafety([buildGroupSafetyPlant(plant, options)], today.toISOString());
    expect(summary.previous.accidents).toBe(1);
    expect(summary.previousRates.frequency).toBe(2000);
    expect(summary.rates.frequency).toBe(2000);
  });

  it("distinguishes multiple root classifications from unique typed events and unclassified events", () => {
    const plant = raw("a", 100, 0);
    const near = event("NEAR_MISS");
    plant.communications = [{ ...near, nearMissType: { name: "Slip" } }, near];
    plant.sewoRecords = [{ communication: { type: "NEAR_MISS" }, templateData: { rootCauseDetails: [{ label: "Training", isRootCause: true }, { label: "Procedure", isRootCause: true }] }, causeSelections: [], updatedAt: today }, { communication: null, templateData: {}, causeSelections: [], updatedAt: today }];
    const result = buildGroupSafetyPlant(plant, options);
    expect(result.rootsNearMiss).toMatchObject({ total: 2, events: 1 });
    expect(result.nearMissTypes).toMatchObject({ total: 2, events: 2 });
    expect(topSafetyDistribution(result.nearMissTypes)).toEqual([{ label: "Slip", count: 1, percentage: 50 }]);
    expect(result.unclassifiedAnalyses).toBe(1);
  });

  it("builds the group record from the combined accident timeline, never the largest individual record", () => {
    const a = buildGroupSafetyPlant(raw("a"), { ...options, injuryDates: [new Date("2026-01-10"), new Date("2026-02-10")], safetyConfig: { historicalRecordDays: 999 } });
    const b = buildGroupSafetyPlant(raw("b"), { ...options, injuryDates: [new Date("2026-01-20"), new Date("2026-03-01")] });
    const summary = summarizeGroupSafety([a, b], today.toISOString());
    expect(summary.currentDays).toBe(9);
    expect(summary.recordDays).toBe(20);
    expect(summary.bestRecord?.safetyDays.recordDays).toBe(999);
    expect(summary.latestPlants.map(plant => plant.code)).toEqual(["b"]);
    expect(summary.bestCurrent?.code).toBe("a");
  });

  it("limits group historical records to the common observation start and includes valid manual baselines", () => {
    const a = buildGroupSafetyPlant({ ...raw("a"), createdAt: new Date("2020-01-01") }, { ...options, safetyConfig: { manualLastAccidentDate: "2026-03-05" } });
    const b = buildGroupSafetyPlant({ ...raw("b"), createdAt: new Date("2026-03-01") }, options);
    const summary = summarizeGroupSafety([a, b], today.toISOString());
    expect(summary.historyStart).toBe("2026-03-01");
    expect(summary.recordDays).toBe(5);
    expect(summary.currentDays).toBe(5);
  });

  it("selects one authorized plant without changing its values and returns empty for an unknown scope", () => {
    const plants = [buildGroupSafetyPlant(raw("a", 100, 1), options), buildGroupSafetyPlant(raw("b", 900, 3), options)];
    expect(selectGroupSafetyPlants(plants, "group")).toBe(plants);
    expect(summarizeGroupSafety(selectGroupSafetyPlants(plants, "b"), today.toISOString()).rates).toEqual(plants[1].rates);
    expect(selectGroupSafetyPlants(plants, "unauthorized")).toEqual([]);
    const empty = summarizeGroupSafety([], today.toISOString());
    expect(empty.currentDays).toBeNull(); expect(empty.recordDays).toBeNull(); expect(empty.rates.frequency).toBeNull(); expect(empty.months).toEqual([]);
  });

  it("handles zero events with known hours without presenting a missing denominator", () => {
    const result = buildGroupSafetyPlant(raw("a", 100, 0), options);
    expect(result.rates.frequency).toBe(0);
    expect(result.missingMonths).toBe(0);
  });
});

describe("group dashboard URLs", () => {
  it.each([undefined, null, "unknown", ""])("defaults %s to the executive view", value => expect(resolveGroupSafetyView(value)).toBe("executive"));
  it.each(["executive", "operational", "risk"] as const)("supports direct links to %s", view => expect(resolveGroupSafetyView(view)).toBe(view));
  it("preserves dates, month, year, area and plant when changing the view", () => {
    const href = groupSafetyHref("area=safety&year=2025&month=6&from=2025-06-02&to=2025-06-20&plant=a&view=executive", { view: "risk" });
    const params = new URL(href, "http://localhost").searchParams;
    expect(Object.fromEntries(params)).toEqual({ area: "safety", year: "2025", month: "6", from: "2025-06-02", to: "2025-06-20", plant: "a", view: "risk" });
  });
});
