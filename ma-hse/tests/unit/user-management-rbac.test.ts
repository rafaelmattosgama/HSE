import { describe, expect, it } from "vitest";
import { RoleCode } from "@prisma/client";
import {
  canCreateRole,
  getCreatableRoles,
  getRoleAssignmentPlantId,
  isPlantScopedUserRole,
  isValidUserPlantRoleScope,
} from "@/lib/rbac/user-management";
import { createPlantUserInput, updatePlantUserInput } from "@/lib/validation/dtos";

describe("user management role policy", () => {
  it("does not expose N0 creation from user management", () => {
    expect(getCreatableRoles(RoleCode.N0_ADMIN)).toEqual([
      RoleCode.N1_CORPORATE,
      RoleCode.N2_PLANT_MANAGER,
      RoleCode.N3_SAFETY,
      RoleCode.N4_SUPERVISOR,
      RoleCode.N5_OPERATOR,
      RoleCode.N6_HR,
    ]);
    expect(canCreateRole(RoleCode.N0_ADMIN, RoleCode.N0_ADMIN)).toBe(false);
  });

  it("allows N1 to create N1/N2/N3/N6_HR", () => {
    expect(getCreatableRoles(RoleCode.N1_CORPORATE)).toEqual([
      RoleCode.N1_CORPORATE,
      RoleCode.N2_PLANT_MANAGER,
      RoleCode.N3_SAFETY,
      RoleCode.N6_HR,
    ]);
  });

  it("allows N2 to create only N6_HR", () => {
    expect(getCreatableRoles(RoleCode.N2_PLANT_MANAGER)).toEqual([RoleCode.N6_HR]);
    expect(canCreateRole(RoleCode.N2_PLANT_MANAGER, RoleCode.N6_HR)).toBe(true);
  });

  it("allows N3 to create only N4/N5/N6_HR", () => {
    expect(getCreatableRoles(RoleCode.N3_SAFETY)).toEqual([
      RoleCode.N4_SUPERVISOR,
      RoleCode.N5_OPERATOR,
      RoleCode.N6_HR,
    ]);
  });

  it("denies forbidden combinations", () => {
    expect(canCreateRole(RoleCode.N3_SAFETY, RoleCode.N2_PLANT_MANAGER)).toBe(false);
    expect(canCreateRole(RoleCode.N2_PLANT_MANAGER, RoleCode.N4_SUPERVISOR)).toBe(false);
    expect(canCreateRole(RoleCode.N5_OPERATOR, RoleCode.N6_HR)).toBe(false);
  });

  it("keeps N1 global and N3 plant-scoped for role assignments", () => {
    expect(getRoleAssignmentPlantId(RoleCode.N1_CORPORATE, "plant-1")).toBeNull();
    expect(getRoleAssignmentPlantId(RoleCode.N3_SAFETY, "plant-1")).toBe("plant-1");
    expect(isPlantScopedUserRole(RoleCode.N3_SAFETY)).toBe(true);
    expect(isPlantScopedUserRole(RoleCode.N1_CORPORATE)).toBe(false);
  });

  it("validates UserPlantRole scope by role type", () => {
    expect(isValidUserPlantRoleScope(RoleCode.N1_CORPORATE, null)).toBe(true);
    expect(isValidUserPlantRoleScope(RoleCode.N1_CORPORATE, "plant-1")).toBe(false);
    expect(isValidUserPlantRoleScope(RoleCode.N3_SAFETY, "plant-1")).toBe(true);
    expect(isValidUserPlantRoleScope(RoleCode.N3_SAFETY, null)).toBe(false);
  });

  it("rejects N0_ADMIN in createPlantUserInput Zod schema", () => {
    const result = createPlantUserInput.safeParse({
      email: "n0-test@example.com",
      name: "N0 Test",
      role: RoleCode.N0_ADMIN,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const roleIssue = result.error.issues.find((issue) => issue.path.includes("role"));
      expect(roleIssue).toBeDefined();
      expect(roleIssue!.message).toContain("N0_ADMIN");
    }
  });

  it("rejects N0_ADMIN in updatePlantUserInput Zod schema", () => {
    const result = updatePlantUserInput.safeParse({
      email: "n0-test@example.com",
      name: "N0 Test Updated",
      role: RoleCode.N0_ADMIN,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const roleIssue = result.error.issues.find((issue) => issue.path.includes("role"));
      expect(roleIssue).toBeDefined();
      expect(roleIssue!.message).toContain("N0_ADMIN");
    }
  });

  it("accepts valid non-N0 roles in createPlantUserInput", () => {
    const validRoles = [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N5_OPERATOR, RoleCode.N6_HR];
    for (const role of validRoles) {
      const result = createPlantUserInput.safeParse({
        email: "test@example.com",
        name: "Test User",
        role,
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts valid non-N0 roles in updatePlantUserInput", () => {
    const validRoles = [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N5_OPERATOR, RoleCode.N6_HR];
    for (const role of validRoles) {
      const result = updatePlantUserInput.safeParse({
        email: "test@example.com",
        name: "Test User",
        role,
      });
      expect(result.success).toBe(true);
    }
  });
});
