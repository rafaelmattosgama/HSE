import { describe, expect, it } from "vitest";
import { resolveStoredChartType } from "@/components/feature/dashboard-visualization-studio";

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
});
