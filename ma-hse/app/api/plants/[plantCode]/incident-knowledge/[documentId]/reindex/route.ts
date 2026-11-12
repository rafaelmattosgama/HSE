import { IncidentKnowledgeExtractionStatus, IncidentKnowledgeReviewStatus } from "@prisma/client";
import { incidentKnowledgeIndexQueue } from "@/jobs/queues";
import { fail, ok } from "@/lib/api";
import { canManageIncidentKnowledge, INCIDENT_KNOWLEDGE_VIEW_ROLES } from "@/lib/incident-knowledge-access";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";

export async function POST(
  _request: Request,
  context: { params: Promise<{ plantCode: string; documentId: string }> },
) {
  const { plantCode, documentId } = await context.params;
  const auth = await requirePlantAccess(plantCode, INCIDENT_KNOWLEDGE_VIEW_ROLES);
  if ("error" in auth) return auth.error;
  if (!canManageIncidentKnowledge(auth.session.user.plantRoles, plantCode)) {
    return fail("FORBIDDEN", "Only an HSE reviewer can reindex an approved document.", 403);
  }

  const plant = await getPlantByCode(plantCode);
  const document = await prisma.incidentKnowledgeDocument.findFirst({
    where: { id: documentId, plantId: plant.id, archivedAt: null, reviewStatus: IncidentKnowledgeReviewStatus.APPROVED },
    select: { id: true, extractionStatus: true, documentVersion: true },
  });
  if (!document) return fail("NOT_FOUND", "Approved Knowledge Base document not found.", 404);
  if (document.extractionStatus === IncidentKnowledgeExtractionStatus.INDEXING) {
    return fail("INDEXING_IN_PROGRESS", "This document is already being indexed.", 409);
  }

  await prisma.$transaction([
    prisma.incidentKnowledgeDocument.update({
      where: { id: document.id },
      data: { extractionStatus: IncidentKnowledgeExtractionStatus.INDEXING, indexedAt: null, lastError: null },
    }),
    prisma.incidentKnowledgeAudit.create({
      data: {
        plantId: plant.id,
        documentId,
        actorUserId: auth.session.user.id,
        operation: "DOCUMENT_REINDEX_REQUESTED",
        changes: { documentVersion: document.documentVersion },
        stateBefore: { extractionStatus: document.extractionStatus },
        stateAfter: { extractionStatus: IncidentKnowledgeExtractionStatus.INDEXING },
      },
    }),
  ]);

  try {
    await incidentKnowledgeIndexQueue.add("reindex-approved-document", { documentId, plantId: plant.id }, {
      jobId: `incident-knowledge-reindex-${documentId}-v${document.documentVersion}-${Date.now()}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 3_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  } catch {
    const message = "Search reindexing could not be queued. The approved incident remains available through text and structured search.";
    await prisma.$transaction([
      prisma.incidentKnowledgeDocument.update({
        where: { id: document.id },
        data: { extractionStatus: IncidentKnowledgeExtractionStatus.APPROVED, lastError: message },
      }),
      prisma.incidentKnowledgeAudit.create({
        data: {
          plantId: plant.id,
          documentId,
          actorUserId: auth.session.user.id,
          operation: "DOCUMENT_REINDEX_QUEUE_FAILED",
          changes: { extractionStatus: IncidentKnowledgeExtractionStatus.APPROVED },
          error: message,
        },
      }),
    ]);
    return fail("QUEUE_UNAVAILABLE", "The search indexing queue is unavailable. Try again later.", 503);
  }

  return ok({ documentId, extractionStatus: IncidentKnowledgeExtractionStatus.INDEXING });
}
