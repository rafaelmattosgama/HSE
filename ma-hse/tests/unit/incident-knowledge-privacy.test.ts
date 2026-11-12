import { describe, expect, it } from "vitest";
import { sanitizeIncidentKnowledgeEmbeddingText, sanitizeIncidentKnowledgeText } from "@/lib/services/incident-knowledge-privacy";

describe("incident knowledge privacy filter", () => {
  it("redacts labeled names and worker numbers even when the form uses a dash", () => {
    const result = sanitizeIncidentKnowledgeText("Nome do trabalhador - Ana Silva\nNúmero do trabalhador: 12345");
    expect(result).not.toContain("Ana Silva");
    expect(result).not.toContain("12345");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts contact details in narrative text", () => {
    const result = sanitizeIncidentKnowledgeText("Contact worker@example.com or call +351 912 345 678");
    expect(result).not.toContain("worker@example.com");
    expect(result).not.toContain("912 345 678");
  });

  it("redacts names near worker references and medical identifiers before embedding", () => {
    const result = sanitizeIncidentKnowledgeEmbeddingText("The worker named Ana Silva reported an incident. Diagnosis: broken wrist. Contact ana@example.com");
    expect(result).not.toContain("Ana Silva");
    expect(result).not.toContain("broken wrist");
    expect(result).not.toContain("ana@example.com");
    expect(result).toContain("[REDACTED_PERSON]");
    expect(result).toContain("[REDACTED_HEALTH_DATA]");
  });
});
