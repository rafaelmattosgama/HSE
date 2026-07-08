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
      roles: [{ plantId: null, plantCode: null, role: RoleCode.N1_CORPORATE }],
      allowedRoles: [RoleCode.N2_PLANT_MANAGER],
    });

    expect(allowed).toBe(true);
  });

  it("does not grant N1 access to N0-only routes", () => {
    const allowed = hasPlantAccess({
      plantCode: "pl99",
      roles: [{ plantId: null, plantCode: null, role: RoleCode.N1_CORPORATE }],
      allowedRoles: [RoleCode.N0_ADMIN],
    });

    expect(allowed).toBe(false);
  });

  it("grants plant-scoped access for the same N3 user across assigned plants only", () => {
    const multiPlantRoles = [
      { plantId: "p1", plantCode: "pt01", role: RoleCode.N3_SAFETY },
      { plantId: "p2", plantCode: "pt02", role: RoleCode.N3_SAFETY },
      { plantId: "p3", plantCode: "pt03", role: RoleCode.N3_SAFETY },
    ];

    expect(
      hasPlantAccess({
        plantCode: "pt02",
        roles: multiPlantRoles,
        allowedRoles: [RoleCode.N3_SAFETY],
      }),
    ).toBe(true);

    expect(
      hasPlantAccess({
        plantCode: "pt04",
        roles: multiPlantRoles,
        allowedRoles: [RoleCode.N3_SAFETY],
      }),
    ).toBe(false);
  });
});
