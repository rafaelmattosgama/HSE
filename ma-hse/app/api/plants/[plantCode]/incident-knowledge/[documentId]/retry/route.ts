import { IncidentKnowledgeExtractionStatus, IncidentKnowledgeReviewStatus } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { canManageIncidentKnowledge, INCIDENT_KNOWLEDGE_VIEW_ROLES } from "@/lib/incident-knowledge-access";
import { incidentKnowledgeExtractionQueue } from "@/jobs/queues";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { refreshIncidentKnowledgeImportBatch } from "@/lib/services/incident-knowledge-import-batch-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ plantCode: string; documentId: string }> },
) {
  const { plantCode, documentId } = await context.params;
  const auth = await requirePlantAccess(plantCode, INCIDENT_KNOWLEDGE_VIEW_ROLES);
  if ("error" in auth) return auth.error;
  if (!canManageIncidentKnowledge(auth.session.user.plantRoles, plantCode)) {
    return fail("FORBIDDEN", "Only an HSE reviewer can retry extraction.", 403);
  }

  const plant = await getPlantByCode(plantCode);
  const document = await prisma.incidentKnowledgeDocument.findFirst({
    where: { id: documentId, plantId: plant.id, archivedAt: null },
    select: {
      id: true,
      plantId: true,
      importBatchId: true,
      extractionStatus: true,
      reviewStatus: true,
      documentVersion: true,
      lastError: true,
      originalFileKey: true,
    },
  });
  if (!document) return fail("NOT_FOUND", "Knowledge Base document not found.", 404);
  const structuredExtractionFailed = document.extractionStatus === IncidentKnowledgeExtractionStatus.PENDING_REVIEW
    && (document.lastError?.startsWith("Local structured extraction failed")
      || document.lastError?.startsWith("Local structured extraction timed out"));
  const retryableStatus = document.extractionStatus === IncidentKnowledgeExtractionStatus.FAILED || structuredExtractionFailed;
  if (document.reviewStatus !== IncidentKnowledgeReviewStatus.PENDING || !retryableStatus) {
    return fail("DOCUMENT_NOT_RETRYABLE", "Only an unreviewed failed extraction can be retried.", 409);
  }
  if (document.lastError?.includes("no usable text layer")) {
    return fail("OCR_REQUIRED", "This PDF has no usable text layer. Complete the review manually from the original PDF.", 409);
  }
  if (!document.originalFileKey) return fail("PDF_NOT_FOUND", "The original PDF is unavailable.", 404);

  const nextVersion = document.documentVersion + 1;
  await prisma.$transaction([
    prisma.incidentKnowledgeDocument.update({
      where: { id: document.id },
      data: {
        documentVersion: nextVersion,
        extractionStatus: IncidentKnowledgeExtractionStatus.UPLOADED,
        lastError: null,
      },
    }),
    prisma.incidentKnowledgeAudit.create({
      data: {
        plantId: plant.id,
        documentId: document.id,
        actorUserId: auth.session.user.id,
        importBatchId: document.importBatchId,
        operation: "EXTRACTION_RETRY_REQUESTED",
        changes: { documentVersion: { from: document.documentVersion, to: nextVersion } },
        stateBefore: { extractionStatus: document.extractionStatus },
        stateAfter: { extractionStatus: IncidentKnowledgeExtractionStatus.UPLOADED },
      },
    }),
  ]);

  try {
    await incidentKnowledgeExtractionQueue.add("extract", { documentId: document.id, plantId: plant.id }, {
      jobId: `incident-knowledge-${document.id}-v${nextVersion}`,
      attempts: 2,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  } catch {
    await prisma.incidentKnowledgeDocument.update({
      where: { id: document.id },
      data: {
        extractionStatus: IncidentKnowledgeExtractionStatus.FAILED,
        lastError: "The extraction queue is unavailable. Try again later.",
      },
    });
    await prisma.incidentKnowledgeAudit.create({
      data: {
        plantId: plant.id,
        documentId: document.id,
        actorUserId: auth.session.user.id,
        importBatchId: document.importBatchId,
        operation: "EXTRACTION_RETRY_QUEUE_FAILED",
        changes: { extractionStatus: IncidentKnowledgeExtractionStatus.FAILED },
        error: "The extraction queue could not accept the retry.",
      },
    });
    await refreshIncidentKnowledgeImportBatch(document.importBatchId);
    return fail("QUEUE_UNAVAILABLE", "The extraction queue is unavailable. Try again later.", 503);
  }

  await refreshIncidentKnowledgeImportBatch(document.importBatchId);
  return ok({ documentId: document.id, extractionStatus: IncidentKnowledgeExtractionStatus.UPLOADED });
}
