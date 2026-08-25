import { CompetenceCellState } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { computeCompetenceActionPrefill } from "@/lib/competence-action-prefill";
import { getUiDictionary } from "@/lib/ui-language";

const labels = getUiDictionary("en").competences;

function gap(overrides: Partial<Parameters<typeof computeCompetenceActionPrefill>[0]> = {}) {
  return {
    competenceTypeName: "Forklift",
    workerName: "Ana Silva",
    state: CompetenceCellState.MISSING,
    isRequired: true,
    validUntil: null,
    daysToExpiry: null,
    roleName: "Logistics operator",
    departmentName: "Logistics",
    blockedReason: null,
    ...overrides,
  };
}

describe("computeCompetenceActionPrefill — §8 pre-fill table", () => {
  it("MISSING + required → CORRECTIVE / HIGH, dueDate left for the server's SLA default", () => {
    const prefill = computeCompetenceActionPrefill(gap(), labels);

    expect(prefill.category).toBe("CORRECTIVE");
    expect(prefill.priority).toBe("HIGH");
    expect(prefill.dueDate).toBeNull();
    expect(prefill.title).toBe("Forklift — Missing — Ana Silva");
    expect(prefill.description).toContain("Logistics operator");
    expect(prefill.description).toContain("Logistics");
    expect(prefill.description).toContain("No training, assessment or authorization on record.");
  });

  it("MISSING but not required (§8 'restantes') → CORRECTIVE / LOW, not HIGH", () => {
    const prefill = computeCompetenceActionPrefill(gap({ isRequired: false }), labels);

    expect(prefill.category).toBe("CORRECTIVE");
    expect(prefill.priority).toBe("LOW");
  });

  it("EXPIRED + required → CORRECTIVE / HIGH", () => {
    const prefill = computeCompetenceActionPrefill(
      gap({ state: CompetenceCellState.EXPIRED, validUntil: new Date("2026-05-01"), blockedReason: null }),
      labels,
    );

    expect(prefill.category).toBe("CORRECTIVE");
    expect(prefill.priority).toBe("HIGH");
    expect(prefill.dueDate).toBeNull();
  });

  it("EXPIRING → PREVENTIVE / MEDIUM, dueDate = validUntil (not the SLA default)", () => {
    const prefill = computeCompetenceActionPrefill(
      gap({ state: CompetenceCellState.EXPIRING, validUntil: new Date("2026-09-23T00:00:00.000Z"), daysToExpiry: 30 }),
      labels,
    );

    expect(prefill.category).toBe("PREVENTIVE");
    expect(prefill.priority).toBe("MEDIUM");
    expect(prefill.dueDate).toBe("2026-09-23");
    expect(prefill.title).toContain("30 days");
  });

  it("AWAITING_ASSESSMENT (§8 'restantes') → PREVENTIVE / LOW", () => {
    const prefill = computeCompetenceActionPrefill(gap({ state: CompetenceCellState.AWAITING_ASSESSMENT, isRequired: true }), labels);

    expect(prefill.category).toBe("PREVENTIVE");
    expect(prefill.priority).toBe("LOW");
  });

  it("passes a stable blockedReason code through formatCompetenceBlockedReason, not as raw text", () => {
    const prefill = computeCompetenceActionPrefill(
      gap({ state: CompetenceCellState.EXPIRED, validUntil: new Date("2026-05-01"), blockedReason: "TRAINING_CERTIFICATE_EXPIRED" }),
      labels,
    );

    expect(prefill.description).toContain("Training certificate expired");
    expect(prefill.description).not.toContain("TRAINING_CERTIFICATE_EXPIRED");
  });

  it("omits role/department lines entirely when unknown, rather than printing empty labels", () => {
    const prefill = computeCompetenceActionPrefill(gap({ roleName: null, departmentName: null }), labels);

    expect(prefill.description).not.toContain(labels.profileRoleLabel);
    expect(prefill.description).not.toContain(labels.profileDeptLabel);
  });
});
