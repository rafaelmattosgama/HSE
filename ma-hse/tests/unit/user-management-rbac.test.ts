import { describe, expect, it } from "vitest";
import { RoleCode } from "@prisma/client";
import {
  canCreateRole,
  getCreatableRoles,
  getRoleAssignmentPlantId,
  isPlantScopedUserRole,
  isValidUserPlantRoleScope,
} from "@/lib/rbac/user-management";
import { createCorporatePlantInput, createPlantUserInput, updatePlantUserInput } from "@/lib/validation/dtos";

describe("user management role policy", () => {
  it("allows plant setup before assigning N2 but prevents N2 creation without a department", () => {
    const plant = { code: "pl03", name: "Plant 3", timezone: "Europe/Lisbon", defaultLanguage: "pt", n1: { email: "n1@example.com", name: "Corporate" }, n3: { email: "n3@example.com", name: "Safety" } };
    expect(createCorporatePlantInput.safeParse(plant).success).toBe(true);
    expect(createCorporatePlantInput.safeParse({ ...plant, n2: { email: "n2@example.com", name: "Manager" } }).success).toBe(false);
    expect(createCorporatePlantInput.safeParse({ ...plant, n2: { email: "n2@example.com", name: "Manager", departmentId: "11111111-1111-4111-8111-111111111111" } }).success).toBe(true);
  });
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
        departmentId: "11111111-1111-4111-8111-111111111111",
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
        departmentId: "11111111-1111-4111-8111-111111111111",
      });
      expect(result.success).toBe(true);
    }
  });

  it.each([RoleCode.N2_PLANT_MANAGER, RoleCode.N4_SUPERVISOR])("requires a department for %s on create and update", (role) => {
    for (const schema of [createPlantUserInput, updatePlantUserInput]) {
      for (const departmentId of [undefined, null, "", "not-an-id"]) {
        expect(schema.safeParse({ email: "user@example.com", name: "Test User", role, departmentId }).success).toBe(false);
      }
    }
  });

  it.each([RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY, RoleCode.N5_OPERATOR, RoleCode.N6_HR])("does not require a department for %s", (role) => {
    expect(createPlantUserInput.safeParse({ email: "user@example.com", name: "Test User", role }).success).toBe(true);
  });
});
