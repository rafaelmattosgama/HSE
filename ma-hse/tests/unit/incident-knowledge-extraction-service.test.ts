import { describe, expect, it } from "vitest";
import { parseIncidentKnowledgeDraftResponse } from "@/lib/services/incident-knowledge-extraction-service";

function parseDraft(overrides: Record<string, unknown>) {
  const base = {
    incidentCode: null,
    incidentDate: null,
    incidentType: null,
    department: null,
    workstation: null,
    equipment: null,
    shift: null,
    operationType: null,
    occurrenceDescription: null,
    occurrenceMechanism: null,
    injuryType: null,
    bodyPart: null,
    consequence: null,
    immediateCorrectiveAction: null,
    lessonsLearned: null,
    previousRelatedOccurrences: null,
    sifPsifClassification: null,
    extractionConfidence: 0.8,
    causes: [],
    actions: [],
    evidence: [],
  };
  return parseIncidentKnowledgeDraftResponse(JSON.stringify({ ...base, ...overrides }));
}

describe("historical S-EWO draft validation", () => {
  it("keeps the CHEP structural failure confirmed and separates other analyzed causes", () => {
    const draft = parseDraft({
      incidentType: "NEAR MISS",
      equipment: "CHEP pallet container",
      occurrenceMechanism: "The container failed structurally and its contents fell to the floor.",
      causes: [
        { originalCauseCode: "6.5", originalCauseLabel: "Failure/breakage", originalTaxonomyVersion: "2026", normalizedCauseCode: null, normalizedCategory: null, description: "The container failed structurally.", assessmentStatus: "CONFIRMED", sourcePage: 2, sourceSection: "Root cause" },
        { originalCauseCode: "1.2", originalCauseLabel: "Limited experience with the specific task", originalTaxonomyVersion: "2026", normalizedCauseCode: null, normalizedCategory: null, description: null, assessmentStatus: "REJECTED", sourcePage: 2, sourceSection: "Analyzed causes" },
        { originalCauseCode: "2.3", originalCauseLabel: "Breaking rules for safety", originalTaxonomyVersion: "2026", normalizedCauseCode: null, normalizedCategory: null, description: null, assessmentStatus: "UNCERTAIN", sourcePage: 2, sourceSection: "Analyzed causes" },
        { originalCauseCode: "2.4", originalCauseLabel: "Failure to respect work cycles and procedure", originalTaxonomyVersion: "2026", normalizedCauseCode: null, normalizedCategory: null, description: null, assessmentStatus: "REJECTED", sourcePage: 2, sourceSection: "Analyzed causes" },
      ],
    });

    expect(draft?.incidentType).toBe("NEAR MISS");
    expect(draft?.causes.find((cause) => cause.originalCauseCode === "6.5")?.assessmentStatus).toBe("CONFIRMED");
    expect(draft?.causes.filter((cause) => cause.assessmentStatus === "CONFIRMED")).toHaveLength(1);
    expect(draft?.causes.some((cause) => cause.assessmentStatus === "REJECTED")).toBe(true);
  });

  it("preserves the First Aid classification, two confirmed ES03 causes and the conditional action", () => {
    const draft = parseDraft({
      incidentType: "FIRST AID",
      equipment: "ES03 welding press",
      injuryType: "Hot water splash",
      causes: [
        { originalCauseCode: "6.2", originalCauseLabel: "Lack of maintenance", originalTaxonomyVersion: "2026", normalizedCauseCode: null, normalizedCategory: null, description: null, assessmentStatus: "CONFIRMED", sourcePage: 1, sourceSection: "Root causes" },
        { originalCauseCode: "6.3", originalCauseLabel: "Weakness in design", originalTaxonomyVersion: "2026", normalizedCauseCode: null, normalizedCategory: null, description: null, assessmentStatus: "CONFIRMED", sourcePage: 1, sourceSection: "Root causes" },
        { originalCauseCode: "2.2", originalCauseLabel: "Incorrect use of protective items", originalTaxonomyVersion: "2026", normalizedCauseCode: null, normalizedCategory: null, description: null, assessmentStatus: "REJECTED", sourcePage: 1, sourceSection: "Analyzed cause" },
      ],
      actions: [
        { description: "Apply thermal insulation to pipes.", actionType: null, responsible: null, plannedClosureDate: null, actualClosureDate: null, status: "PLANNED", sourcePage: 2, sourceSection: "Actions" },
        { description: "Test the inlet and outlet flow control system.", actionType: null, responsible: null, plannedClosureDate: null, actualClosureDate: null, status: "PLANNED", sourcePage: 2, sourceSection: "Actions" },
        { description: "If the test is satisfactory, assess this change on other welding presses.", actionType: null, responsible: null, plannedClosureDate: null, actualClosureDate: null, status: "UNKNOWN", sourcePage: 2, sourceSection: "Actions" },
      ],
    });

    expect(draft?.incidentType).toBe("FIRST AID");
    expect(draft?.causes.filter((cause) => cause.assessmentStatus === "CONFIRMED").map((cause) => cause.originalCauseCode)).toEqual(["6.2", "6.3"]);
    expect(draft?.actions).toHaveLength(3);
    expect(draft?.actions[2].description).toContain("If the test is satisfactory");
    expect(draft?.actions[2].status).toBe("UNKNOWN");
  });

  it("keeps the 2025 First Aid category and the stored-energy mechanism and measures", () => {
    const draft = parseDraft({
      incidentCode: "08 MAAP 03_2025",
      incidentType: "FIRST AID",
      occurrenceMechanism: "A tensioned steel cable retracted suddenly, releasing stored potential energy.",
      causes: [
        { originalCauseCode: "7.7", originalCauseLabel: "Other / Risks not identified", originalTaxonomyVersion: "2025", normalizedCauseCode: null, normalizedCategory: null, description: "Stored energy was not identified and controlled.", assessmentStatus: "CONFIRMED", sourcePage: 2, sourceSection: "Five whys" },
      ],
      actions: [
        { description: "Review the risk assessment.", actionType: null, responsible: null, plannedClosureDate: null, actualClosureDate: null, status: "UNKNOWN", sourcePage: 3, sourceSection: "Actions" },
        { description: "Establish a procedure for work on balancers.", actionType: null, responsible: null, plannedClosureDate: null, actualClosureDate: null, status: "UNKNOWN", sourcePage: 3, sourceSection: "Actions" },
        { description: "Train workers on stored-energy hazards and the procedure.", actionType: null, responsible: null, plannedClosureDate: null, actualClosureDate: null, status: "UNKNOWN", sourcePage: 3, sourceSection: "Actions" },
      ],
    });

    expect(draft?.incidentCode).toBe("08 MAAP 03_2025");
    expect(draft?.incidentType).toBe("FIRST AID");
    expect(draft?.causes[0].originalCauseCode).toBe("7.7");
    expect(draft?.occurrenceMechanism).toContain("stored potential energy");
    expect(draft?.actions).toHaveLength(3);
  });

  it("rejects malformed JSON and keeps invalid cause states uncertain", () => {
    expect(parseIncidentKnowledgeDraftResponse("not json")).toBeNull();
    const draft = parseDraft({
      causes: [{ originalCauseCode: "6.5", assessmentStatus: "ROOT_CAUSE", sourcePage: 1 }],
    });
    expect(draft?.causes[0].assessmentStatus).toBe("UNCERTAIN");
  });

  it("drops impossible calendar dates instead of normalizing them into another day", () => {
    const draft = parseDraft({ incidentDate: "2026-02-30" });
    expect(draft?.incidentDate).toBeNull();
  });
});
