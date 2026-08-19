import { RoleCode } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  getSafetyDashboardRole,
  hasSafetyDashboardAccess,
  hasSafetyDashboardDetailedReadAccess,
} from "@/lib/rbac/dashboard";

const plantCode = "maap";

function plantRole(role: RoleCode, code = plantCode) {
  return [{ plantId: "plant-1", plantCode: code, role }];
}

describe("Safety Dashboard read access", () => {
  it.each([RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR])(
    "%s has the same detailed dashboard read tier for its assigned plant",
    (role) => {
      const roles = plantRole(role);
      const resolvedRole = getSafetyDashboardRole(plantCode, roles);

      expect(hasSafetyDashboardAccess(plantCode, roles)).toBe(true);
      expect(resolvedRole).toBe(role);
      expect(hasSafetyDashboardDetailedReadAccess(resolvedRole)).toBe(true);
    },
  );

  it("keeps dashboard reads within the assigned plant", () => {
    const roles = plantRole(RoleCode.N4_SUPERVISOR, "other");

    expect(hasSafetyDashboardAccess(plantCode, roles)).toBe(false);
    expect(getSafetyDashboardRole(plantCode, roles)).toBeUndefined();
  });

  it("preserves the existing N5 baseline dashboard without detailed indicators", () => {
    const roles = plantRole(RoleCode.N5_OPERATOR);
    const resolvedRole = getSafetyDashboardRole(plantCode, roles);

    expect(hasSafetyDashboardAccess(plantCode, roles)).toBe(true);
    expect(hasSafetyDashboardDetailedReadAccess(resolvedRole)).toBe(false);
  });

  it("keeps N1 cross-plant dashboard access", () => {
    const roles = [{ plantId: null, plantCode: null, role: RoleCode.N1_CORPORATE }];

    expect(hasSafetyDashboardAccess(plantCode, roles)).toBe(true);
    expect(getSafetyDashboardRole(plantCode, roles)).toBe(RoleCode.N1_CORPORATE);
    expect(hasSafetyDashboardDetailedReadAccess(RoleCode.N1_CORPORATE)).toBe(true);
  });
});
