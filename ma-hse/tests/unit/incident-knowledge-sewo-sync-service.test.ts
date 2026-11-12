import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const txMock = vi.hoisted(() => ({
  sEWO: { findFirst: vi.fn() },
  incidentKnowledgeDocument: { upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() },
  incidentKnowledgeRecord: { upsert: vi.fn() },
  incidentKnowledgeEvidence: { deleteMany: vi.fn(), createMany: vi.fn() },
  incidentKnowledgeCause: { deleteMany: vi.fn(), createMany: vi.fn() },
  incidentKnowledgeAction: { deleteMany: vi.fn(), createMany: vi.fn() },
  incidentKnowledgeChunk: { deleteMany: vi.fn() },
  incidentKnowledgeAudit: { create: vi.fn() },
}));
const prismaMock = vi.hoisted(() => ({
  prisma: {
    sEWO: { findFirst: vi.fn() },
    incidentKnowledgeDocument: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    incidentKnowledgeRecord: { upsert: vi.fn() },
    incidentKnowledgeEvidence: { deleteMany: vi.fn(), createMany: vi.fn() },
    incidentKnowledgeCause: { deleteMany: vi.fn(), createMany: vi.fn() },
    incidentKnowledgeAction: { deleteMany: vi.fn(), createMany: vi.fn() },
    incidentKnowledgeChunk: { deleteMany: vi.fn() },
    incidentKnowledgeAudit: { findFirst: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/services/sewo-validation-service", () => ({
  formatSewoOccurrenceType: vi.fn(() => "Near Miss"),
  getSewoTemplateRecord: (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value : {},
}));

import { synchronizeApprovedSewoToIncidentKnowledge } from "@/lib/services/incident-knowledge-sewo-sync-service";

function approvedSewo(overrides: Record<string, unknown> = {}) {
  return {
    id: "sewo-1",
    plantId: "plant-1",
    status: "APPROVED",
    deletedAt: null,
    approvedAt: new Date("2026-03-14T12:00:00.000Z"),
    approvedByUserId: "reviewer-1",
    codigoSewo: "sewo_MAAPNM202605",
    codigoFabrica: "MAAP",
    tipo: "NM",
    numeroSequencial: 5,
    analysisDate: new Date("2026-03-14T12:00:00.000Z"),
    eventClassification: "Near miss",
    whatText: "Occurrence category",
    whereText: "Raw material warehouse",
    whoText: "John Smith - 12345",
    whichText: "CHEP container",
    howText: "A container failed while moved by a forklift.",
    immediateCorrectiveActionText: "Quarantine damaged containers.",
    templateData: {
      involvedWorkerName: "John Smith",
      involvedWorkerEmployeeNo: "12345",
      involvedWorkerDepartment: "Logistics",
      rootCauseDetails: [{ label: "6.5 Failure / breakage", comment: "The container failed structurally.", isRootCause: true }],
      sifPsifDecision: { result: "NO_PSIF" },
    },
    plant: { code: "MAAP" },
    communication: { type: "NEAR_MISS", description: "A container failed during forklift movement.", area: null, workstation: null, equipment: null },
    area: null,
    line: null,
    shift: { name: "A" },
    causeCatalogVersion: { version: 7 },
    causeSelections: [],
    actions: [{ id: "action-1", title: "Inspect containers", description: "Add a receiving inspection.", category: "CORRECTIVE", status: "OPEN", dueDate: new Date("2026-04-01T00:00:00.000Z"), closedAt: null }],
    actionLinks: [],
    ...overrides,
  };
}

describe("synchronize approved current S-EWO records", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.prisma.$transaction.mockImplementation(async (operation: unknown) => {
      return typeof operation === "function" ? operation(txMock) : Promise.all(operation as Promise<unknown>[]);
    });
    prismaMock.prisma.sEWO.findFirst.mockResolvedValue(approvedSewo());
    prismaMock.prisma.incidentKnowledgeDocument.findFirst.mockResolvedValue(null);
    prismaMock.prisma.incidentKnowledgeDocument.findMany.mockResolvedValue([]);
    prismaMock.prisma.incidentKnowledgeAudit.findFirst.mockResolvedValue(null);
    txMock.sEWO.findFirst.mockResolvedValue({ id: "sewo-1" });
    txMock.incidentKnowledgeDocument.upsert.mockResolvedValue({ id: "doc-current" });
    txMock.incidentKnowledgeRecord.upsert.mockResolvedValue({ id: "record-current" });
    txMock.incidentKnowledgeDocument.updateMany.mockResolvedValue({ count: 1 });
    txMock.incidentKnowledgeDocument.findFirst.mockResolvedValue(null);
  });

  afterEach(() => vi.clearAllMocks());

  it("copies only minimized structured fields and preserves approved causes and action dates", async () => {
    const result = await synchronizeApprovedSewoToIncidentKnowledge({ sewoId: "sewo-1", plantId: "plant-1", actorUserId: "reviewer-1" });

    expect(result).toMatchObject({ documentId: "doc-current", shouldIndex: true, linkedHistorical: false });
    expect(txMock.incidentKnowledgeDocument.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { sourceSewoId: "sewo-1" },
      create: expect.objectContaining({
        plantId: "plant-1",
        sourceType: "CURRENT_SEWO",
        sourceSewoId: "sewo-1",
        reviewStatus: "APPROVED",
      }),
    }));
    expect("originalFileKey" in txMock.incidentKnowledgeDocument.upsert.mock.calls[0][0].create).toBe(false);
    const recordWrite = txMock.incidentKnowledgeRecord.upsert.mock.calls[0][0];
    expect(recordWrite.create).toMatchObject({
      incidentCode: "sewo_MAAPNM202605",
      department: "Logistics",
      equipment: "CHEP container",
      shift: "A",
      injuryType: null,
      bodyPart: null,
      consequence: null,
    });
    expect(JSON.stringify(recordWrite)).not.toContain("John Smith");
    expect(JSON.stringify(recordWrite)).not.toContain("12345");
    const causes = txMock.incidentKnowledgeCause.createMany.mock.calls[0][0].data;
    expect(causes[0]).toMatchObject({ originalCauseLabel: "6.5 Failure / breakage", assessmentStatus: "CONFIRMED" });
    const actions = txMock.incidentKnowledgeAction.createMany.mock.calls[0][0].data;
    expect(actions[0]).toMatchObject({
      linkedActionId: "action-1",
      status: "PLANNED",
      plannedClosureDate: new Date("2026-04-01T00:00:00.000Z"),
      actualClosureDate: null,
      responsible: null,
    });
    expect(JSON.stringify(prismaMock.prisma.incidentKnowledgeAudit.create.mock.calls)).not.toContain("container failed while moved");
  });

  it("links a matching approved historical PDF instead of creating a duplicate current-S-EWO document", async () => {
    prismaMock.prisma.incidentKnowledgeDocument.findMany.mockResolvedValue([{
      id: "doc-historical",
      incidentDate: new Date("2026-03-14T00:00:00.000Z"),
      incidentType: "Near miss",
      sourceReference: "sewo_MAAPNM202605",
      originalFilename: "S-EWO_05_MAAP_NEAR MISS_2026_03.pdf",
      extractionStatus: "INDEXED",
      record: { incidentCode: "sewo_MAAPNM202605", incidentDate: new Date("2026-03-14T00:00:00.000Z") },
    }]);

    const result = await synchronizeApprovedSewoToIncidentKnowledge({ sewoId: "sewo-1", plantId: "plant-1" });

    expect(result).toMatchObject({ documentId: "doc-historical", shouldIndex: false, linkedHistorical: true });
    expect(txMock.incidentKnowledgeDocument.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "doc-historical", sourceSewoId: null }),
      data: { sourceSewoId: "sewo-1" },
    }));
    expect(txMock.incidentKnowledgeDocument.upsert).not.toHaveBeenCalled();
  });

  it("revokes and removes indexed current-S-EWO data when Corporate approval is withdrawn", async () => {
    prismaMock.prisma.sEWO.findFirst.mockResolvedValue(approvedSewo({ status: "REJECTED" }));
    prismaMock.prisma.incidentKnowledgeDocument.findFirst.mockResolvedValue({
      id: "doc-current",
      sourceType: "CURRENT_SEWO",
      reviewStatus: "APPROVED",
      extractionStatus: "INDEXED",
    });
    txMock.incidentKnowledgeDocument.findFirst.mockResolvedValue({ id: "doc-current", reviewStatus: "APPROVED", extractionStatus: "INDEXED" });

    const result = await synchronizeApprovedSewoToIncidentKnowledge({ sewoId: "sewo-1", plantId: "plant-1" });

    expect(result).toMatchObject({ documentId: null, shouldIndex: false, reason: "not_approved" });
    expect(txMock.incidentKnowledgeChunk.deleteMany).toHaveBeenCalledWith({ where: { documentId: "doc-current", plantId: "plant-1" } });
    expect(txMock.incidentKnowledgeDocument.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "doc-current" },
      data: expect.objectContaining({ reviewStatus: "REJECTED", extractionStatus: "REJECTED", archivedAt: expect.any(Date) }),
    }));
  });

  it("does not rewrite or reindex an unchanged S-EWO on repeated backfill", async () => {
    await synchronizeApprovedSewoToIncidentKnowledge({ sewoId: "sewo-1", plantId: "plant-1" });
    const changes = txMock.incidentKnowledgeAudit.create.mock.calls.find((call) => call[0].data.operation === "CURRENT_SEWO_SYNCED")?.[0].data.changes;
    expect(changes).toBeDefined();

    prismaMock.prisma.incidentKnowledgeDocument.findFirst.mockResolvedValue({
      id: "doc-current",
      sourceType: "CURRENT_SEWO",
      reviewStatus: "APPROVED",
      archivedAt: null,
      extractionStatus: "INDEXED",
      documentVersion: 1,
    });
    prismaMock.prisma.incidentKnowledgeDocument.findMany.mockResolvedValue([]);
    prismaMock.prisma.incidentKnowledgeAudit.findFirst.mockResolvedValue({ changes });

    const result = await synchronizeApprovedSewoToIncidentKnowledge({ sewoId: "sewo-1", plantId: "plant-1" });

    expect(result).toMatchObject({ documentId: "doc-current", shouldIndex: false, unchanged: true });
    expect(txMock.incidentKnowledgeDocument.upsert).toHaveBeenCalledOnce();
  });
});
