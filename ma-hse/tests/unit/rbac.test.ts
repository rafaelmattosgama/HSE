import { describe, expect, it } from "vitest";
import { RoleCode } from "@prisma/client";
import { hasPlantAccess } from "@/lib/rbac/evaluator";

describe("rbac evaluator", () => {
  const roles = [
    {
      plantId: "p1",
      plantCode: "pl01",
      role: RoleCode.N3_SAFETY,
    },
  ];

  it("grants access for exact plant and role", () => {
    const allowed = hasPlantAccess({
      plantCode: "pl01",
      roles,
      allowedRoles: [RoleCode.N3_SAFETY],
    });

    expect(allowed).toBe(true);
  });

  it("denies access for wrong plant", () => {
    const allowed = hasPlantAccess({
      plantCode: "pl02",
      roles,
      allowedRoles: [RoleCode.N3_SAFETY],
    });

    expect(allowed).toBe(false);
  });

  it("grants corporate cross-plant access", () => {
    const allowed = hasPlantAccess({
      plantCode: "pl99",
      roles: [{ plantId: "c", plantCode: "pl01", role: RoleCode.N1_CORPORATE }],
      allowedRoles: [RoleCode.N2_PLANT_MANAGER],
    });

    expect(allowed).toBe(true);
  });
});