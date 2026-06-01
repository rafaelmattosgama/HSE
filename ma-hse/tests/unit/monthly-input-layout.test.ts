import { describe, expect, it } from "vitest";
import { calculateTonKm, calculateTonKmMonths } from "@/lib/services/monthly-input-calculations";
import {
  createMonthlyIndicatorConfig,
  getMonthlyInputSectionOrder,
  isMaterialsMonthlySection,
  isTransportMonthlySection,
} from "@/lib/services/monthly-input-layout";

describe("monthly input layout", () => {
  it("includes the new supported monthly input sections", () => {
    expect(getMonthlyInputSectionOrder()).toEqual([
      "Core Inputs",
      "Scope 1",
      "Scope 2",
      "Scope 3",
      "Inbounds",
      "Outbounds",
      "Materials",
    ]);
  });

  it("creates transport indicators with the expected defaults", () => {
    const indicator = createMonthlyIndicatorConfig("Inbounds", null, "transport-row");

    expect(isTransportMonthlySection(indicator.section)).toBe(true);
    expect(indicator.label).toBe("New supplier");
    expect(indicator.col2Label).toBe("Transport type");
    expect(indicator.col2Options).toEqual([
      "Lorry 7.5–16 ton",
      "Lorry 16–32 ton",
      "Lorry >32 ton",
      "Ship",
      "Plane",
    ]);
    expect(indicator.col3Unit).toBe("Kg");
    expect(indicator.col3Options).toEqual(["Kg", "Ton"]);
  });

  it("creates materials indicators with the expected defaults", () => {
    const indicator = createMonthlyIndicatorConfig("Materials", null, "material-row");

    expect(isMaterialsMonthlySection(indicator.section)).toBe(true);
    expect(indicator.label).toBe("New material");
    expect(indicator.col2Label).toBeNull();
    expect(indicator.col2Options).toEqual([]);
    expect(indicator.col3Unit).toBe("Kg");
    expect(indicator.col3Options).toEqual(["Kg", "Ton"]);
  });
});

describe("monthly input calculations", () => {
  it("calculates ton/km using tons divided by distance and converts kilograms automatically", () => {
    expect(calculateTonKm(500, "Kg", "120")).toBe(0.004167);
    expect(calculateTonKm(1.5, "Ton", "120")).toBe(0.0125);
  });

  it("accepts comma-separated distances and calculates monthly ton/km values", () => {
    expect(calculateTonKm(250, "Kg", "49,5")).toBe(0.005051);
    expect(calculateTonKmMonths([1000, null, 2500], "Kg", "10")).toEqual([0.1, null, 0.25]);
  });

  it("returns null when the distance or unit is invalid", () => {
    expect(calculateTonKm(100, "Kg", "-10")).toBeNull();
    expect(calculateTonKm(100, "Kg", "0")).toBeNull();
    expect(calculateTonKm(100, "Units", "10")).toBeNull();
    expect(calculateTonKmMonths([100], "Ton", "abc")).toEqual([null]);
  });
});
