import { IncidentKnowledgeExtractionStatus, IncidentKnowledgeReviewStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { indexApprovedIncidentKnowledgeDocument } from "@/lib/services/incident-knowledge-index-service";

export type IncidentKnowledgeIndexJob = {
  documentId: string;
  plantId: string;
  attemptsMade?: number;
  maxAttempts?: number;
};

export async function handleIncidentKnowledgeIndex(job: IncidentKnowledgeIndexJob) {
  const document = await prisma.incidentKnowledgeDocument.findFirst({
    where: {
      id: job.documentId,
      plantId: job.plantId,
      archivedAt: null,
      reviewStatus: IncidentKnowledgeReviewStatus.APPROVED,
    },
    select: { id: true, extractionStatus: true, indexedAt: true },
  });
  if (!document) return;

  await prisma.incidentKnowledgeDocument.update({
    where: { id: document.id },
    data: { extractionStatus: IncidentKnowledgeExtractionStatus.INDEXING, lastError: null },
  });

  try {
    const indexed = await indexApprovedIncidentKnowledgeDocument(document.id, job.plantId);
    if (!indexed) return;
    const indexedAt = new Date();
    await prisma.$transaction([
      prisma.incidentKnowledgeDocument.updateMany({
        where: {
          id: document.id,
          plantId: job.plantId,
          archivedAt: null,
          reviewStatus: IncidentKnowledgeReviewStatus.APPROVED,
        },
        data: { extractionStatus: IncidentKnowledgeExtractionStatus.INDEXED, indexedAt, lastError: null },
      }),
      prisma.incidentKnowledgeAudit.create({
        data: {
          plantId: job.plantId,
          documentId: document.id,
          operation: "DOCUMENT_INDEXED",
          changes: { status: IncidentKnowledgeExtractionStatus.INDEXED },
          stateBefore: { extractionStatus: document.extractionStatus, indexedAt: document.indexedAt?.toISOString() ?? null },
          stateAfter: { extractionStatus: IncidentKnowledgeExtractionStatus.INDEXED, indexedAt: indexedAt.toISOString() },
        },
      }),
    ]);
  } catch {
    const attemptsMade = job.attemptsMade ?? 0;
    const maxAttempts = job.maxAttempts ?? 1;
    const finalAttempt = attemptsMade + 1 >= maxAttempts;
    const message = finalAttempt
      ? "Semantic indexing failed. The approved incident remains available through text and structured search; HSE can retry indexing."
      : "Semantic indexing failed once. A retry is queued; text and structured search remain available.";
    await prisma.$transaction([
      prisma.incidentKnowledgeDocument.updateMany({
        where: {
          id: document.id,
          plantId: job.plantId,
          reviewStatus: IncidentKnowledgeReviewStatus.APPROVED,
          archivedAt: null,
        },
        data: {
          extractionStatus: finalAttempt ? IncidentKnowledgeExtractionStatus.APPROVED : IncidentKnowledgeExtractionStatus.INDEXING,
          indexedAt: null,
          lastError: message,
        },
      }),
      prisma.incidentKnowledgeAudit.create({
        data: {
          plantId: job.plantId,
          documentId: document.id,
          operation: "DOCUMENT_INDEXING_FAILED",
          changes: { status: finalAttempt ? IncidentKnowledgeExtractionStatus.APPROVED : IncidentKnowledgeExtractionStatus.INDEXING, attemptsMade: attemptsMade + 1, maxAttempts },
          error: message,
        },
      }),
    ]);
    throw new Error(message);
  }
}
