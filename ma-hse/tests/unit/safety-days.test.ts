import { describe, expect, it } from "vitest";
import { buildSafetyDaysSummary } from "@/lib/safety-days";

describe("buildSafetyDaysSummary", () => {
  it("uses the latest recorded injury for the current counter", () => {
    const summary = buildSafetyDaysSummary({
      plantCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
      injuryDates: [
        new Date("2026-01-10T10:00:00.000Z"),
        new Date("2026-02-01T10:00:00.000Z"),
      ],
      today: new Date("2026-02-11T12:00:00.000Z"),
    });

    expect(summary.currentDays).toBe(10);
    expect(summary.recordDays).toBe(22);
    expect(summary.lastAccidentDate).toBe("2026-02-01");
    expect(summary.source).toBe("recorded");
  });

  it("uses the manual admin date when it is newer than recorded injuries", () => {
    const summary = buildSafetyDaysSummary({
      plantCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
      injuryDates: [new Date("2026-01-10T10:00:00.000Z")],
      manualLastAccidentDate: "2026-02-05",
      today: new Date("2026-02-12T12:00:00.000Z"),
    });

    expect(summary.currentDays).toBe(7);
    expect(summary.recordDays).toBe(26);
    expect(summary.lastAccidentDate).toBe("2026-02-05");
    expect(summary.source).toBe("manual");
  });

  it("falls back to plant creation when there is no known accident", () => {
    const summary = buildSafetyDaysSummary({
      plantCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
      injuryDates: [],
      today: new Date("2026-01-16T12:00:00.000Z"),
    });

    expect(summary.currentDays).toBe(15);
    expect(summary.recordDays).toBe(15);
    expect(summary.lastAccidentDate).toBeNull();
    expect(summary.source).toBe("plant-start");
  });

  it("keeps the current counter and applies a manual historical record", () => {
    const summary = buildSafetyDaysSummary({
      plantCreatedAt: new Date("2026-01-01T00:00:00.000Z"),
      injuryDates: [new Date("2026-01-10T10:00:00.000Z")],
      historicalRecordDays: 120,
      historicalRecordStartDate: "2025-01-01",
      today: new Date("2026-02-01T12:00:00.000Z"),
    });

    expect(summary.currentDays).toBe(22);
    expect(summary.recordDays).toBe(120);
    expect(summary.recordSource).toBe("historical");
    expect(summary.historicalRecordStartDate).toBe("2025-01-01");
  });
});
