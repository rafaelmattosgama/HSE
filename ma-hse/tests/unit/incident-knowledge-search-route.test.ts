import { NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  incidentKnowledgeAudit: { create: vi.fn() },
  incidentKnowledgeDocument: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}));
const authMock = vi.hoisted(() => ({ requirePlantAccess: vi.fn() }));
const plantMock = vi.hoisted(() => ({ getPlantByCode: vi.fn() }));
const embeddingsMock = vi.hoisted(() => ({ createIncidentKnowledgeEmbeddings: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/rbac/guards", () => authMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/services/incident-knowledge-index-service", () => embeddingsMock);

import { GET } from "@/app/api/plants/[plantCode]/incident-knowledge/search/route";

const record = {
  incidentCode: "S-EWO-05",
  incidentDate: new Date("2026-03-12T00:00:00.000Z"),
  department: "Logistics",
  workstation: "Raw material warehouse",
  equipment: "CHEP container",
  operationType: "Forklift movement",
  occurrenceDescription: "A container failed structurally during handling.",
  occurrenceMechanism: "The container structure gave way during forklift movement.",
  immediateCorrectiveAction: "Notify the supplier.",
  lessonsLearned: "Inspect containers before movement.",
  evidences: [{ fieldName: "occurrenceDescription", sourcePage: 2 }],
  causes: [{
    originalCauseCode: "6.5",
    originalCauseLabel: "Failure / breakage",
    normalizedCategory: null,
    description: "The container failed structurally.",
    assessmentStatus: "CONFIRMED",
    sourcePage: 4,
  }],
  actions: [{
    description: "Notify the supplier.",
    actionType: "Communication",
    plannedClosureDate: null,
    actualClosureDate: null,
    status: "PLANNED",
    sourcePage: 6,
  }],
};

const approvedDocument = {
  id: "doc-1",
  plant: { code: "MAAP", name: "Valença - MAAP" },
  incidentType: "Near miss",
  incidentDate: record.incidentDate,
  sourceReference: "S-EWO-05.pdf",
  record,
};

function makeRequest(query: string) {
  return new Request(`http://localhost/api/plants/MAAP/incident-knowledge/search?${query}`);
}

describe("incident knowledge search route", () => {
  afterEach(() => vi.clearAllMocks());

  it("requires plant access before querying knowledge data", async () => {
    authMock.requirePlantAccess.mockResolvedValue({ error: NextResponse.json({ ok: false }, { status: 403 }) });

    const response = await GET(makeRequest("q=container"), { params: Promise.resolve({ plantCode: "MAAP" }) });

    if (!response) throw new Error("Expected an access response.");
    expect(response.status).toBe(403);
    expect(plantMock.getPlantByCode).not.toHaveBeenCalled();
    expect(prismaMock.incidentKnowledgeDocument.findMany).not.toHaveBeenCalled();
  });

  it("keeps approved text search available when embeddings are unavailable and searches all plants", async () => {
    authMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } } });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    embeddingsMock.createIncidentKnowledgeEmbeddings.mockRejectedValue(new Error("offline"));
    prismaMock.incidentKnowledgeDocument.findMany.mockResolvedValue([approvedDocument]);
    prismaMock.incidentKnowledgeAudit.create.mockResolvedValue({});

    const response = await GET(makeRequest("q=container"), { params: Promise.resolve({ plantCode: "MAAP" }) });
    if (!response) throw new Error("Expected a search response.");
    const payload = await response.json() as { data: { results: Array<{ incidentCode: string; causes: Array<{ assessmentStatus: string }>; actions: Array<{ status: string }> }>; semanticUnavailable: boolean } };

    expect(response.status).toBe(200);
    expect(payload.data.semanticUnavailable).toBe(true);
    expect(payload.data.results[0].incidentCode).toBe("S-EWO-05");
    expect(payload.data.results[0].causes[0].assessmentStatus).toBe("CONFIRMED");
    expect(payload.data.results[0].actions[0].status).toBe("PLANNED");
    const where = prismaMock.incidentKnowledgeDocument.findMany.mock.calls[0][0].where;
    expect(where.plantId).toBeUndefined();
    expect(where.reviewStatus).toBe("APPROVED");
    expect(where.archivedAt).toBeNull();
  });

  it("returns semantically matched approved documents with source pages", async () => {
    authMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } } });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    embeddingsMock.createIncidentKnowledgeEmbeddings.mockResolvedValue([Array.from({ length: 1536 }, () => 0.01)]);
    prismaMock.$queryRaw.mockResolvedValue([{ documentId: "doc-1", content: "Confirmed cause: structural failure.", pageStart: 4, score: 0.82 }]);
    prismaMock.incidentKnowledgeDocument.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([approvedDocument]);
    prismaMock.incidentKnowledgeAudit.create.mockResolvedValue({});

    const response = await GET(makeRequest("q=structural%20failure&department=Logistics"), { params: Promise.resolve({ plantCode: "MAAP" }) });
    if (!response) throw new Error("Expected a search response.");
    const payload = await response.json() as { data: { results: Array<{ documentId: string; excerpts: Array<{ page: number }> }> } };

    expect(response.status).toBe(200);
    expect(payload.data.results[0].documentId).toBe("doc-1");
    expect(payload.data.results[0].excerpts[0].page).toBe(4);
    expect(prismaMock.$queryRaw).toHaveBeenCalledOnce();
    const vectorSearchSql = prismaMock.$queryRaw.mock.calls[0][0] as { text: string; values: unknown[] };
    expect(vectorSearchSql.text).toContain('d."reviewStatus"');
    expect(vectorSearchSql.values).not.toContain("plant-1");
    expect(vectorSearchSql.values).not.toContain("structural failure");
  });

  it("does not send a standalone person name to the embedding service or include it in audit data", async () => {
    authMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } } });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.incidentKnowledgeDocument.findMany.mockResolvedValue([]);
    prismaMock.incidentKnowledgeAudit.create.mockResolvedValue({});

    const response = await GET(makeRequest("q=Ana%20Silva"), { params: Promise.resolve({ plantCode: "MAAP" }) });
    if (!response) throw new Error("Expected a search response.");
    const payload = await response.json() as { data: { semanticUnavailable: boolean; notice: string | null; results: unknown[] } };

    expect(response.status).toBe(200);
    expect(embeddingsMock.createIncidentKnowledgeEmbeddings).not.toHaveBeenCalled();
    expect(payload.data.notice).toContain("skipped for privacy");
    expect(payload.data.results).toEqual([]);
    expect(JSON.stringify(prismaMock.incidentKnowledgeAudit.create.mock.calls[0][0])).not.toContain("Ana Silva");
  });
});
