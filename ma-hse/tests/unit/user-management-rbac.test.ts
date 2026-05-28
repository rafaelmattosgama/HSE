import { describe, expect, it } from "vitest";
import { RoleCode } from "@prisma/client";
import { canCreateRole, getCreatableRoles } from "@/lib/rbac/user-management";

describe("user management role policy", () => {
  it("does not expose N0 creation from user management", () => {
    expect(getCreatableRoles(RoleCode.N0_ADMIN)).toEqual([
      RoleCode.N1_CORPORATE,
      RoleCode.N2_PLANT_MANAGER,
      RoleCode.N3_SAFETY,
      RoleCode.N4_SUPERVISOR,
      RoleCode.N5_OPERATOR,
      RoleCode.MEDICO,
    ]);
    expect(canCreateRole(RoleCode.N0_ADMIN, RoleCode.N0_ADMIN)).toBe(false);
  });

  it("allows N1 to create only N1/N2/N3", () => {
    expect(getCreatableRoles(RoleCode.N1_CORPORATE)).toEqual([
      RoleCode.N1_CORPORATE,
      RoleCode.N2_PLANT_MANAGER,
      RoleCode.N3_SAFETY,
    ]);
  });

  it("allows N3 to create only N4/N5/MEDICO", () => {
    expect(getCreatableRoles(RoleCode.N3_SAFETY)).toEqual([
      RoleCode.N4_SUPERVISOR,
      RoleCode.N5_OPERATOR,
      RoleCode.MEDICO,
    ]);
  });

  it("denies forbidden combinations", () => {
    expect(canCreateRole(RoleCode.N3_SAFETY, RoleCode.N2_PLANT_MANAGER)).toBe(false);
    expect(canCreateRole(RoleCode.N2_PLANT_MANAGER, RoleCode.N4_SUPERVISOR)).toBe(false);
    expect(canCreateRole(RoleCode.N5_OPERATOR, RoleCode.MEDICO)).toBe(false);
  });
});
