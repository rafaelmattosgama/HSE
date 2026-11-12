import { afterEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ sEWO: { findMany: vi.fn() } }));
const queuesMock = vi.hoisted(() => ({ incidentKnowledgeSewoSyncQueue: { addBulk: vi.fn() } }));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/jobs/queues", () => ({
  incidentKnowledgeIndexQueue: { add: vi.fn() },
  incidentKnowledgeSewoSyncQueue: queuesMock.incidentKnowledgeSewoSyncQueue,
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/services/incident-knowledge-sewo-sync-service", () => ({
  synchronizeApprovedSewoToIncidentKnowledge: vi.fn(),
}));

import { handleIncidentKnowledgeSewoSync } from "@/jobs/handlers/incident-knowledge-sewo-sync";

describe("automatic approved S-EWO backfill", () => {
  afterEach(() => vi.clearAllMocks());

  it("queues eligible records for one plant without requiring a user action", async () => {
    const updatedAt = new Date("2026-10-29T12:00:00.000Z");
    prismaMock.sEWO.findMany.mockResolvedValueOnce([
      { id: "sewo-approved", updatedAt },
      { id: "sewo-closed", updatedAt },
    ]).mockResolvedValueOnce([]);
    queuesMock.incidentKnowledgeSewoSyncQueue.addBulk.mockResolvedValue([]);

    await handleIncidentKnowledgeSewoSync({ plantId: "plant-1", backfill: true });

    expect(prismaMock.sEWO.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        plantId: "plant-1",
        deletedAt: null,
        status: { in: ["APPROVED", "CLOSED"] },
      }),
      take: 500,
    }));
    expect(queuesMock.incidentKnowledgeSewoSyncQueue.addBulk).toHaveBeenCalledWith([
      expect.objectContaining({ data: { sewoId: "sewo-approved", plantId: "plant-1", actorUserId: null } }),
      expect.objectContaining({ data: { sewoId: "sewo-closed", plantId: "plant-1", actorUserId: null } }),
    ]);
  });
});
