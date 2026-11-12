import { IncidentKnowledgeExtractionStatus, IncidentKnowledgeReviewStatus, SEWOStatus } from "@prisma/client";
import { incidentKnowledgeIndexQueue, incidentKnowledgeSewoSyncQueue } from "@/jobs/queues";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { synchronizeApprovedSewoToIncidentKnowledge } from "@/lib/services/incident-knowledge-sewo-sync-service";

export type IncidentKnowledgeSewoSyncJob = {
  sewoId?: string;
  plantId: string;
  actorUserId?: string | null;
  backfill?: boolean;
};

export async function handleIncidentKnowledgeSewoSync(job: IncidentKnowledgeSewoSyncJob) {
  if (job.backfill) {
    let cursor: string | undefined;
    while (true) {
      const records = await prisma.sEWO.findMany({
        where: {
          plantId: job.plantId,
          deletedAt: null,
          status: { in: [SEWOStatus.APPROVED, SEWOStatus.CLOSED] },
          OR: [{ approvedAt: { not: null } }, { approvedByUserId: { not: null } }],
        },
        select: { id: true, updatedAt: true },
        orderBy: { id: "asc" },
        take: 500,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!records.length) break;

      await incidentKnowledgeSewoSyncQueue.addBulk(records.map((record) => ({
        name: "sync-approved-sewo",
        data: { sewoId: record.id, plantId: job.plantId, actorUserId: job.actorUserId ?? null },
        opts: {
          jobId: `incident-knowledge-sewo-sync:${record.id}:${record.updatedAt.getTime()}`,
          attempts: 3,
          backoff: { type: "exponential" as const, delay: 3_000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      })));

      cursor = records[records.length - 1].id;
      if (records.length < 500) break;
    }
    return;
  }

  const sewoId = job.sewoId;
  if (!sewoId) throw new Error("An S-EWO ID is required for individual synchronization.");
  const result = await synchronizeApprovedSewoToIncidentKnowledge({
    sewoId,
    plantId: job.plantId,
    actorUserId: job.actorUserId,
  });
  if (!result.documentId || !result.shouldIndex) return;

  const document = await prisma.incidentKnowledgeDocument.findFirst({
    where: {
      id: result.documentId,
      plantId: job.plantId,
      archivedAt: null,
      reviewStatus: IncidentKnowledgeReviewStatus.APPROVED,
    },
    select: { id: true, documentVersion: true },
  });
  if (!document) return;

  await prisma.incidentKnowledgeDocument.updateMany({
    where: {
      id: document.id,
      plantId: job.plantId,
      archivedAt: null,
      reviewStatus: IncidentKnowledgeReviewStatus.APPROVED,
    },
    data: { extractionStatus: IncidentKnowledgeExtractionStatus.INDEXING, indexedAt: null, lastError: null },
  });

  try {
    await incidentKnowledgeIndexQueue.add("index-current-sewo", { documentId: document.id, plantId: job.plantId }, {
      jobId: `incident-knowledge-sewo-index-${sewoId}-v${document.documentVersion}-${Date.now()}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 3_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  } catch (error) {
    const message = "The approved S-EWO is available through text search; semantic indexing could not be queued.";
    await prisma.$transaction([
      prisma.incidentKnowledgeDocument.updateMany({
        where: { id: document.id, plantId: job.plantId, reviewStatus: IncidentKnowledgeReviewStatus.APPROVED, archivedAt: null },
        data: { extractionStatus: IncidentKnowledgeExtractionStatus.APPROVED, indexedAt: null, lastError: message },
      }),
      prisma.incidentKnowledgeAudit.create({
        data: {
          plantId: job.plantId,
          documentId: document.id,
          actorUserId: job.actorUserId ?? null,
          operation: "CURRENT_SEWO_INDEXING_QUEUE_FAILED",
          changes: { extractionStatus: IncidentKnowledgeExtractionStatus.APPROVED },
          error: message,
        },
      }),
    ]);
    logger.error({ error, plantId: job.plantId, sewoId }, "incident_knowledge_sewo_index_queue_failed");
  }
}
