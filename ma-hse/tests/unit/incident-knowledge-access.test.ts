import { RoleCode, IncidentKnowledgeExtractionStatus as Extraction } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { canManageIncidentKnowledge, canReadIncidentKnowledge } from "@/lib/incident-knowledge-access";
import { summarizeIncidentKnowledgeBatch } from "@/lib/services/incident-knowledge-import-batch-service";

describe("incident knowledge access and import progress", () => {
  it("limits Knowledge Base management to N0 admins across plants", () => {
    expect(canManageIncidentKnowledge([{ role: RoleCode.N3_SAFETY, plantCode: "MAAP" }], "MAAP")).toBe(false);
    expect(canManageIncidentKnowledge([{ role: RoleCode.N3_SAFETY, plantCode: "MAAP" }], "OTHER")).toBe(false);
    expect(canManageIncidentKnowledge([{ role: RoleCode.N2_PLANT_MANAGER, plantCode: "MAAP" }], "MAAP")).toBe(false);
    expect(canManageIncidentKnowledge([{ role: RoleCode.N0_ADMIN, plantCode: null }], "OTHER")).toBe(true);
  });

  it("allows Knowledge Base consultation only to N0 admins across plants", () => {
    expect(canReadIncidentKnowledge([{ role: RoleCode.N2_PLANT_MANAGER, plantCode: "MAAP" }], "MAAP")).toBe(false);
    expect(canReadIncidentKnowledge([{ role: RoleCode.N2_PLANT_MANAGER, plantCode: "MAAP" }], "OTHER")).toBe(false);
    expect(canReadIncidentKnowledge([{ role: RoleCode.N1_CORPORATE, plantCode: null }], "OTHER")).toBe(false);
    expect(canReadIncidentKnowledge([{ role: RoleCode.N0_ADMIN, plantCode: null }], "OTHER")).toBe(true);
    expect(canReadIncidentKnowledge([{ role: RoleCode.N4_SUPERVISOR, plantCode: "MAAP" }], "MAAP")).toBe(false);
  });

  it("recomputes progress from document states so retries do not double-count", () => {
    const progress = summarizeIncidentKnowledgeBatch([
      Extraction.PENDING_REVIEW,
      Extraction.FAILED,
      Extraction.EXTRACTING,
    ], 3);
    expect(progress).toEqual({ processedCount: 1, failedCount: 1, status: "PROCESSING", finishedAt: false });

    const finished = summarizeIncidentKnowledgeBatch([
      Extraction.PENDING_REVIEW,
      Extraction.FAILED,
    ], 2);
    expect(finished).toEqual({ processedCount: 1, failedCount: 1, status: "COMPLETED_WITH_ERRORS", finishedAt: true });

    const indexing = summarizeIncidentKnowledgeBatch([Extraction.INDEXING], 1);
    expect(indexing).toEqual({ processedCount: 1, failedCount: 0, status: "COMPLETED", finishedAt: true });
  });
});
