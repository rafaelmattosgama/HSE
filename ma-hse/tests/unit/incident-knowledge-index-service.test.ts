import { IncidentKnowledgeCauseAssessment } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildIncidentKnowledgeIndexChunks } from "@/lib/services/incident-knowledge-index-service";

describe("incident knowledge embedding text", () => {
  it("builds chunks only from reviewed, minimized fields and preserves cause assessment and page references", () => {
    const chunks = buildIncidentKnowledgeIndexChunks({
      incidentType: "Near miss",
      incidentYear: 2026,
      record: {
        department: "Logistics",
        workstation: "Raw material warehouse",
        equipment: "CHEP container",
        operationType: "Forklift movement",
        occurrenceDescription: "A worker named Ana Silva moved a container that failed structurally.",
        occurrenceMechanism: "The container structure gave way while it was being moved.",
        immediateCorrectiveAction: "Inform the supplier about damaged containers.",
        lessonsLearned: "Inspect load containers before movement.",
        evidences: [{ fieldName: "occurrenceDescription", sourcePage: 2 }],
        causes: [{
          originalCauseCode: "6.5",
          originalCauseLabel: "Failure / breakage",
          normalizedCategory: null,
          description: "Container structural failure.",
          assessmentStatus: IncidentKnowledgeCauseAssessment.CONFIRMED,
          sourcePage: 4,
        }],
        actions: [{
          description: "Inform the supplier about the risk.",
          actionType: "Communication",
          status: "PLANNED",
          sourcePage: 6,
        }],
      },
    });

    expect(chunks).toHaveLength(4);
    expect(chunks[0].pageStart).toBe(2);
    expect(chunks.some((chunk) => chunk.content.includes("Ana Silva"))).toBe(false);
    expect(chunks.some((chunk) => chunk.content.includes("6.5"))).toBe(true);
    expect(chunks.some((chunk) => chunk.content.includes("Assessment: CONFIRMED"))).toBe(true);
    expect(chunks.some((chunk) => chunk.content.includes("Action status: PLANNED"))).toBe(true);
  });
});
