import { RoleCode } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { canImportSafetyKpiHistory, canReplaceSafetyKpiHistory } from "@/lib/rbac/safety-kpi-history";

describe("historical safety KPI import permissions", () => {
  it("allows N0 globally, N1 globally and N3 only for its own plant", () => {
    expect(canImportSafetyKpiHistory([{ role: RoleCode.N0_ADMIN, plantCode: null }], "MAAP")).toBe(true);
    expect(canImportSafetyKpiHistory([{ role: RoleCode.N1_CORPORATE, plantCode: null }], "MAAP")).toBe(true);
    expect(canImportSafetyKpiHistory([{ role: RoleCode.N3_SAFETY, plantCode: "maap" }], "MAAP")).toBe(true);
    expect(canImportSafetyKpiHistory([{ role: RoleCode.N3_SAFETY, plantCode: "other" }], "MAAP")).toBe(false);
    expect(canImportSafetyKpiHistory([{ role: RoleCode.N2_PLANT_MANAGER, plantCode: "MAAP" }], "MAAP")).toBe(false);
  });
  it("reserves REPLACE for N0/N1", () => {
    expect(canReplaceSafetyKpiHistory([{ role: RoleCode.N0_ADMIN, plantCode: null }], "MAAP")).toBe(true);
    expect(canReplaceSafetyKpiHistory([{ role: RoleCode.N3_SAFETY, plantCode: "MAAP" }], "MAAP")).toBe(false);
  });
});
