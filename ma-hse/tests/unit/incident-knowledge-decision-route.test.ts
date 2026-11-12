import { NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  incidentKnowledgeDocument: { findFirst: vi.fn(), update: vi.fn() },
  incidentKnowledgeRecord: { updateMany: vi.fn() },
  incidentKnowledgeAudit: { create: vi.fn() },
  sEWO: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));
const authMock = vi.hoisted(() => ({ requirePlantAccess: vi.fn() }));
const accessMock = vi.hoisted(() => ({
  canManageIncidentKnowledge: vi.fn(() => true),
  INCIDENT_KNOWLEDGE_VIEW_ROLES: ["N0_ADMIN", "N3_SAFETY"],
}));
const plantMock = vi.hoisted(() => ({ getPlantByCode: vi.fn() }));
const queuesMock = vi.hoisted(() => ({
  incidentKnowledgeIndexQueue: { add: vi.fn() },
  incidentKnowledgeSewoSyncQueue: { addBulk: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/rbac/guards", () => authMock);
vi.mock("@/lib/incident-knowledge-access", () => accessMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/jobs/queues", () => queuesMock);

import { POST } from "@/app/api/plants/[plantCode]/incident-knowledge/[documentId]/decision/route";

describe("incident knowledge approval deduplication", () => {
  afterEach(() => vi.clearAllMocks());

  it("queues current S-EWOs from the same plant and incident month for duplicate reconciliation", async () => {
    authMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "reviewer-1", plantRoles: [] } } });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.incidentKnowledgeDocument.findFirst.mockResolvedValue({
      id: "historical-1",
      sourceType: "HISTORICAL_PDF",
      incidentDate: new Date("2026-03-01T00:00:00.000Z"),
      reviewStatus: "PENDING",
      extractionStatus: "PENDING_REVIEW",
      record: {
        incidentCode: "S-EWO-05",
        incidentDate: new Date("2026-03-14T00:00:00.000Z"),
        occurrenceDescription: "A container failed structurally.",
        occurrenceMechanism: null,
      },
    });
    prismaMock.$transaction.mockImplementation(async (operations: Promise<unknown>[]) => Promise.all(operations));
    queuesMock.incidentKnowledgeIndexQueue.add.mockResolvedValue({ id: "index-job" });
    prismaMock.sEWO.findMany.mockResolvedValue([{ id: "sewo-1", updatedAt: new Date("2026-03-15T00:00:00.000Z") }]);
    queuesMock.incidentKnowledgeSewoSyncQueue.addBulk.mockResolvedValue([]);
    prismaMock.incidentKnowledgeAudit.create.mockResolvedValue({});

    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "APPROVE" }),
    }), { params: Promise.resolve({ plantCode: "MAAP", documentId: "historical-1" }) });
    if (!response) throw new Error("Expected an approval response.");
    const payload = await response.json() as { data: { duplicateCheckQueued: boolean } };

    expect(response.status).toBe(200);
    expect(payload.data.duplicateCheckQueued).toBe(true);
    expect(prismaMock.sEWO.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        plantId: "plant-1",
        deletedAt: null,
        AND: [{ OR: [expect.objectContaining({ analysisDate: { gte: new Date("2026-03-01T00:00:00.000Z"), lt: new Date("2026-04-01T00:00:00.000Z") } }), { codigoSewo: "S-EWO-05" }] }],
      }),
    }));
    expect(queuesMock.incidentKnowledgeSewoSyncQueue.addBulk).toHaveBeenCalledWith([
      expect.objectContaining({ data: { sewoId: "sewo-1", plantId: "plant-1", actorUserId: "reviewer-1" } }),
    ]);
  });

  it("does not approve without plant authorization", async () => {
    authMock.requirePlantAccess.mockResolvedValue({ error: NextResponse.json({ ok: false }, { status: 403 }) });

    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ decision: "APPROVE" }),
    }), { params: Promise.resolve({ plantCode: "MAAP", documentId: "historical-1" }) });

    if (!response) throw new Error("Expected an authorization response.");
    expect(response.status).toBe(403);
    expect(prismaMock.incidentKnowledgeDocument.findFirst).not.toHaveBeenCalled();
  });
});
