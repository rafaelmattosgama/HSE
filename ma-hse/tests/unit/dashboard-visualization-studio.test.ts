import { describe, expect, it } from "vitest";
import { resolveStoredChartType } from "@/components/feature/dashboard-visualization-studio";
import { buildMonthBuckets, limitDashboardMonthBucketsToObserved } from "@/lib/dashboard-visualization";

describe("resolveStoredChartType", () => {
  it("falls back to the SSR-safe default when no preference is stored", () => {
    expect(resolveStoredChartType(null, true)).toBe("bar");
    expect(resolveStoredChartType(null, false)).toBe("pareto");
  });

  it("keeps valid stored chart types", () => {
    expect(resolveStoredChartType("pareto", true)).toBe("pareto");
    expect(resolveStoredChartType("circular", true)).toBe("circular");
    expect(resolveStoredChartType("points", true)).toBe("points");
  });

  it("normalizes trend-only chart types when the timeline is unavailable", () => {
    expect(resolveStoredChartType("bar", false)).toBe("pareto");
    expect(resolveStoredChartType("points", false)).toBe("pareto");
  });

  it("does not include future months in a dashboard trend and marks the current month as partial", () => {
    const months = buildMonthBuckets(new Date("2026-01-01T00:00:00.000Z"), new Date("2026-12-31T23:59:59.999Z"));
    const observed = limitDashboardMonthBucketsToObserved(months, {
      now: new Date("2026-08-18T12:00:00.000Z"),
      partialLabel: "partial",
    });

    expect(observed).toHaveLength(8);
    expect(observed.at(-1)).toMatchObject({ key: "2026-08", label: "Aug 2026 (partial)" });
    expect(observed.some((bucket) => bucket.key === "2026-09")).toBe(false);
  });
});
