import { IncidentKnowledgeExtractionStatus, IncidentKnowledgeReviewStatus } from "@prisma/client";
import { incidentKnowledgeIndexQueue } from "@/jobs/queues";
import { fail, ok } from "@/lib/api";
import { canManageIncidentKnowledge, INCIDENT_KNOWLEDGE_VIEW_ROLES } from "@/lib/incident-knowledge-access";
import { logger } from "@/lib/logger";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";

export async function POST(
  _request: Request,
  context: { params: Promise<{ plantCode: string }> },
) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, INCIDENT_KNOWLEDGE_VIEW_ROLES);
  if ("error" in auth) return auth.error;
  if (!canManageIncidentKnowledge(auth.session.user.plantRoles, plantCode)) {
    return fail("FORBIDDEN", "Only an HSE reviewer can queue approved documents for indexing.", 403);
  }

  const plant = await getPlantByCode(plantCode);
  const documents = await prisma.incidentKnowledgeDocument.findMany({
    where: {
      plantId: plant.id,
      archivedAt: null,
      reviewStatus: IncidentKnowledgeReviewStatus.APPROVED,
      extractionStatus: IncidentKnowledgeExtractionStatus.APPROVED,
    },
    select: { id: true, documentVersion: true },
    orderBy: { createdAt: "asc" },
  });
  let queuedCount = 0;
  for (const document of documents) {
    const claimed = await prisma.incidentKnowledgeDocument.updateMany({
      where: {
        id: document.id,
        plantId: plant.id,
        reviewStatus: IncidentKnowledgeReviewStatus.APPROVED,
        extractionStatus: IncidentKnowledgeExtractionStatus.APPROVED,
        archivedAt: null,
      },
      data: { extractionStatus: IncidentKnowledgeExtractionStatus.INDEXING, lastError: null, indexedAt: null },
    });
    if (claimed.count === 0) continue;

    try {
      await incidentKnowledgeIndexQueue.add("index-approved-document", { documentId: document.id, plantId: plant.id }, {
        jobId: `incident-knowledge-index-${document.id}-v${document.documentVersion}-${Date.now()}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 3_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      });
    } catch {
      const message = "Search indexing could not be queued. The approved incident remains available through text and structured search.";
      await prisma.incidentKnowledgeDocument.updateMany({
        where: { id: document.id, plantId: plant.id, reviewStatus: IncidentKnowledgeReviewStatus.APPROVED, archivedAt: null },
        data: { extractionStatus: IncidentKnowledgeExtractionStatus.APPROVED, indexedAt: null, lastError: message },
      });
      await prisma.incidentKnowledgeAudit.create({
        data: {
          plantId: plant.id,
          documentId: document.id,
          actorUserId: auth.session.user.id,
          operation: "DOCUMENT_INDEXING_QUEUE_FAILED",
          changes: { extractionStatus: IncidentKnowledgeExtractionStatus.APPROVED },
          error: message,
        },
      });
      continue;
    }

    queuedCount += 1;
    try {
      await prisma.incidentKnowledgeAudit.create({
        data: {
          plantId: plant.id,
          documentId: document.id,
          actorUserId: auth.session.user.id,
          operation: "DOCUMENT_REINDEX_REQUESTED",
          changes: { documentVersion: document.documentVersion, source: "BULK_REINDEX" },
          stateAfter: { extractionStatus: IncidentKnowledgeExtractionStatus.INDEXING },
        },
      });
    } catch (error) {
      logger.error({ error, plantCode, documentId: document.id }, "incident_knowledge_reindex_audit_failed");
    }
  }

  return ok({ queuedCount });
}
