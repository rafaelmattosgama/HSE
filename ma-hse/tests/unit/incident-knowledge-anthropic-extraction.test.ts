import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class APIError extends Error {
    status?: number;
  }
  class RateLimitError extends APIError {}
  class APIConnectionTimeoutError extends APIError {}
  const create = vi.fn();
  const constructorArgs: unknown[] = [];
  class MockAnthropic {
    static APIError = APIError;
    static RateLimitError = RateLimitError;
    static APIConnectionTimeoutError = APIConnectionTimeoutError;
    beta = { messages: { create } };
    constructor(options: unknown) {
      constructorArgs.push(options);
    }
  }
  const env: Record<string, unknown> = {};
  return { create, constructorArgs, MockAnthropic, RateLimitError, env };
});

vi.mock("@anthropic-ai/sdk", () => ({ default: mocks.MockAnthropic }));
vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

import {
  extractIncidentKnowledgeDraft,
  resolveIncidentKnowledgeExtractionProvider,
} from "@/lib/services/incident-knowledge-extraction-service";
import { sanitizeIncidentKnowledgeExtractionText } from "@/lib/services/incident-knowledge-privacy";

const emptyDraft = {
  incidentCode: "S-EWO 05",
  incidentDate: "2026-03-14",
  incidentType: "NEAR MISS",
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
  extractionConfidence: 0.7,
  causes: [],
  actions: [],
  evidence: [],
};

const pages = [{
  pageNumber: 1,
  text: "Date: 14.03.2026\nInjured person: John Smith\nemail: john.smith@example.com\nphone +351 912 345 678\nThe pallet failed.",
}];

function setEnv(values: Record<string, unknown>) {
  for (const key of Object.keys(mocks.env)) delete mocks.env[key];
  Object.assign(mocks.env, {
    AGENT_PROVIDER: "openai",
    AGENT_LOCAL_BASE_URL: "http://127.0.0.1:11434/v1",
    AGENT_LOCAL_MODEL: "qwen3:1.7b",
    ANTHROPIC_MODEL: "claude-sonnet-5-5",
    ...values,
  });
}

describe("incident knowledge extraction provider", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.constructorArgs.length = 0;
  });

  it("keeps the legacy behaviour when the provider is not set", () => {
    setEnv({ AGENT_PROVIDER: "ollama" });
    expect(resolveIncidentKnowledgeExtractionProvider()).toBe("ollama");
    setEnv({ AGENT_PROVIDER: "openai" });
    expect(resolveIncidentKnowledgeExtractionProvider()).toBe("disabled");
    setEnv({ AGENT_PROVIDER: "ollama", INCIDENT_KNOWLEDGE_EXTRACTION_PROVIDER: "anthropic" });
    expect(resolveIncidentKnowledgeExtractionProvider()).toBe("anthropic");
  });

  it("skips without calling the API when the key is missing", async () => {
    setEnv({ INCIDENT_KNOWLEDGE_EXTRACTION_PROVIDER: "anthropic" });
    const result = await extractIncidentKnowledgeDraft(pages);
    expect(result.draft).toBeNull();
    expect(result.warning).toMatch(/not configured/);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("sends only sanitized text, keeps dates and returns the validated draft", async () => {
    setEnv({ INCIDENT_KNOWLEDGE_EXTRACTION_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test-key" });
    mocks.create.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(emptyDraft) }],
    });

    const result = await extractIncidentKnowledgeDraft(pages);

    expect(result.warning).toBeNull();
    expect(result.draft).toMatchObject({ incidentCode: "S-EWO 05", incidentDate: "2026-03-14" });
    const request = mocks.create.mock.calls[0][0];
    expect(request.model).toBe("claude-sonnet-5-5");
    expect(request.output_config.format.type).toBe("json_schema");
    const sent = request.messages[0].content as string;
    expect(sent).toContain("14.03.2026");
    expect(sent).not.toContain("John Smith");
    expect(sent).not.toContain("john.smith@example.com");
    expect(sent).not.toContain("912 345 678");
  });

  it("returns a warning instead of throwing on refusals and API errors", async () => {
    setEnv({ INCIDENT_KNOWLEDGE_EXTRACTION_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test-key" });
    mocks.create.mockResolvedValueOnce({ stop_reason: "refusal", content: [] });
    expect((await extractIncidentKnowledgeDraft(pages)).warning).toMatch(/declined/);

    mocks.create.mockRejectedValueOnce(new mocks.RateLimitError("429"));
    expect((await extractIncidentKnowledgeDraft(pages)).warning).toMatch(/rate limited/);

    mocks.create.mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "not json" }] });
    expect((await extractIncidentKnowledgeDraft(pages)).warning).toMatch(/invalid draft/);
  });

  it("skips extraction when the provider is disabled", async () => {
    setEnv({ INCIDENT_KNOWLEDGE_EXTRACTION_PROVIDER: "disabled", ANTHROPIC_API_KEY: "test-key" });
    const result = await extractIncidentKnowledgeDraft(pages);
    expect(result.draft).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("extraction text sanitization", () => {
  it("redacts personal data but keeps incident dates", () => {
    const text = sanitizeIncidentKnowledgeExtractionText(
      "Incident on 2026-03-14 and 14/03/2026\nDate of birth: 01.02.1980\nCall +351 912 345 678",
    );
    expect(text).toContain("2026-03-14");
    expect(text).toContain("14/03/2026");
    expect(text).not.toContain("01.02.1980");
    expect(text).not.toContain("912 345 678");
  });
});
