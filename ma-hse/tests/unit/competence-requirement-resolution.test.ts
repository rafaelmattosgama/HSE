import { AuthorizationStatus, CompetenceCellState, CompetenceRequirementScope } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  computeCompetenceCellState,
  resolveCompetenceRequirement,
  type RequirementRuleForResolution,
} from "@/lib/services/competence-state-service";

function rule(overrides: Partial<RequirementRuleForResolution>): RequirementRuleForResolution {
  return {
    competenceTypeId: "type-forklift",
    scopeType: CompetenceRequirementScope.ALL_WORKERS,
    scopeRoleName: null,
    scopeAreaId: null,
    scopeWorkstationId: null,
    ...overrides,
  };
}

describe("resolveCompetenceRequirement — §3.2, the four scopes", () => {
  it("ALL_WORKERS matches every worker regardless of role, area or workstation", () => {
    const result = resolveCompetenceRequirement(
      { areaId: null, roleName: null, workstationId: null },
      "type-forklift",
      [rule({ scopeType: CompetenceRequirementScope.ALL_WORKERS })],
    );

    expect(result).toEqual({ isRequired: true, requirementSource: "ALL_WORKERS" });
  });

  it("ROLE matches case- and accent-insensitively", () => {
    const rules = [
      rule({ scopeType: CompetenceRequirementScope.ROLE, scopeRoleName: "Operador Logística" }),
    ];

    const result = resolveCompetenceRequirement(
      { areaId: null, roleName: "operador logistica", workstationId: null },
      "type-forklift",
      rules,
    );

    expect(result).toEqual({ isRequired: true, requirementSource: "ROLE:Operador Logística" });
  });

  it("ROLE does not match a worker with a different role, or no role at all", () => {
    const rules = [rule({ scopeType: CompetenceRequirementScope.ROLE, scopeRoleName: "Operador Logística" })];

    expect(resolveCompetenceRequirement({ areaId: null, roleName: "Motorista", workstationId: null }, "type-forklift", rules)).toEqual({
      isRequired: false,
      requirementSource: null,
    });
    expect(resolveCompetenceRequirement({ areaId: null, roleName: null, workstationId: null }, "type-forklift", rules)).toEqual({
      isRequired: false,
      requirementSource: null,
    });
  });

  it("AREA matches only workers assigned to that area", () => {
    const rules = [rule({ scopeType: CompetenceRequirementScope.AREA, scopeAreaId: "area-logistics" })];

    expect(resolveCompetenceRequirement({ areaId: "area-logistics", roleName: null, workstationId: null }, "type-forklift", rules)).toEqual({
      isRequired: true,
      requirementSource: "AREA:area-logistics",
    });
    expect(resolveCompetenceRequirement({ areaId: "area-quality", roleName: null, workstationId: null }, "type-forklift", rules)).toEqual({
      isRequired: false,
      requirementSource: null,
    });
  });

  it("WORKSTATION matches only workers whose linked occupational-health record has that workstation", () => {
    const rules = [rule({ scopeType: CompetenceRequirementScope.WORKSTATION, scopeWorkstationId: "workstation-dock-3" })];

    expect(
      resolveCompetenceRequirement({ areaId: null, roleName: null, workstationId: "workstation-dock-3" }, "type-forklift", rules),
    ).toEqual({ isRequired: true, requirementSource: "WORKSTATION:workstation-dock-3" });
    expect(
      resolveCompetenceRequirement({ areaId: null, roleName: null, workstationId: "workstation-dock-1" }, "type-forklift", rules),
    ).toEqual({ isRequired: false, requirementSource: null });
    expect(resolveCompetenceRequirement({ areaId: null, roleName: null, workstationId: null }, "type-forklift", rules)).toEqual({
      isRequired: false,
      requirementSource: null,
    });
  });

  it("ignores rules for a different competence type entirely", () => {
    const rules = [rule({ competenceTypeId: "type-mewp", scopeType: CompetenceRequirementScope.ALL_WORKERS })];

    const result = resolveCompetenceRequirement({ areaId: null, roleName: null, workstationId: null }, "type-forklift", rules);

    expect(result).toEqual({ isRequired: false, requirementSource: null });
  });

  it("overlapping rules only add — a worker matched by two independent rules is still simply required, not double-counted", () => {
    const rules = [
      rule({ scopeType: CompetenceRequirementScope.ROLE, scopeRoleName: "Operador Logística" }),
      rule({ scopeType: CompetenceRequirementScope.AREA, scopeAreaId: "area-logistics" }),
    ];
    const worker = { areaId: "area-logistics", roleName: "Operador Logística", workstationId: null };

    expect(resolveCompetenceRequirement(worker, "type-forklift", rules).isRequired).toBe(true);
    // Order must not matter: the same worker is required whichever rule is evaluated first.
    expect(resolveCompetenceRequirement(worker, "type-forklift", [...rules].reverse()).isRequired).toBe(true);
  });

  it("a rule that no longer matches (deactivated / role changed) does not block a rule that does — rules never subtract", () => {
    const rules = [
      rule({ scopeType: CompetenceRequirementScope.ROLE, scopeRoleName: "Some Other Role" }),
      rule({ scopeType: CompetenceRequirementScope.ALL_WORKERS }),
    ];

    const result = resolveCompetenceRequirement({ areaId: null, roleName: "Operador Logística", workstationId: null }, "type-forklift", rules);

    expect(result).toEqual({ isRequired: true, requirementSource: "ALL_WORKERS" });
  });
});

describe("resolution feeding the §5 algorithm — the deliberate step-1 exception", () => {
  it("a competence no longer required (no rule matches) but with an ACTIVE authorization shows the real state, not NOT_APPLICABLE", () => {
    const resolved = resolveCompetenceRequirement({ areaId: "area-quality", roleName: "Motorista", workstationId: null }, "type-forklift", [
      rule({ scopeType: CompetenceRequirementScope.AREA, scopeAreaId: "area-logistics" }),
    ]);
    expect(resolved.isRequired).toBe(false);

    const state = computeCompetenceCellState({
      now: new Date("2026-01-01T00:00:00.000Z"),
      isRequired: resolved.isRequired,
      requirementSource: resolved.requirementSource,
      requiresAssessment: true,
      authorizations: [
        {
          id: "auth-1",
          status: AuthorizationStatus.ACTIVE,
          validUntil: new Date("2027-01-01T00:00:00.000Z"),
          suspensionReason: null,
          revocationReason: null,
          trainingRecordId: null,
          grantedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
      trainingRecords: [],
      assessments: [],
      expiringThresholdDays: 90,
      medicalFitnessBlocksAuthorization: false,
      medicalFitnessExpired: false,
    });

    expect(state.state).toBe(CompetenceCellState.VALID);
    expect(state.isRequired).toBe(false);
  });

  it("a competence no longer required and with no authorization at all correctly resolves to NOT_APPLICABLE", () => {
    const resolved = resolveCompetenceRequirement({ areaId: "area-quality", roleName: "Motorista", workstationId: null }, "type-forklift", [
      rule({ scopeType: CompetenceRequirementScope.AREA, scopeAreaId: "area-logistics" }),
    ]);

    const state = computeCompetenceCellState({
      now: new Date("2026-01-01T00:00:00.000Z"),
      isRequired: resolved.isRequired,
      requirementSource: resolved.requirementSource,
      requiresAssessment: true,
      authorizations: [],
      trainingRecords: [],
      assessments: [],
      expiringThresholdDays: 90,
      medicalFitnessBlocksAuthorization: false,
      medicalFitnessExpired: false,
    });

    expect(state.state).toBe(CompetenceCellState.NOT_APPLICABLE);
  });
});
