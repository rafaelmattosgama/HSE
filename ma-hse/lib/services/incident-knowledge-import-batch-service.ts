import {
  IncidentKnowledgeExtractionStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

const COMPLETED_STATUSES = new Set<IncidentKnowledgeExtractionStatus>([
  IncidentKnowledgeExtractionStatus.PENDING_REVIEW,
  IncidentKnowledgeExtractionStatus.APPROVED,
  IncidentKnowledgeExtractionStatus.INDEXING,
  IncidentKnowledgeExtractionStatus.INDEXED,
]);

const FAILED_STATUSES = new Set<IncidentKnowledgeExtractionStatus>([
  IncidentKnowledgeExtractionStatus.FAILED,
  IncidentKnowledgeExtractionStatus.REJECTED,
]);

export function summarizeIncidentKnowledgeBatch(
  statuses: IncidentKnowledgeExtractionStatus[],
  fileCount: number,
) {
  const processedCount = statuses.filter((status) => COMPLETED_STATUSES.has(status)).length;
  const failedCount = statuses.filter((status) => FAILED_STATUSES.has(status)).length;
  const finished = processedCount + failedCount >= fileCount;
  return {
    processedCount,
    failedCount,
    status: finished
      ? failedCount > 0 ? "COMPLETED_WITH_ERRORS" as const : "COMPLETED" as const
      : "PROCESSING" as const,
    finishedAt: finished,
  };
}

/** Recompute from document state so BullMQ retries cannot double-count a file. */
export async function refreshIncidentKnowledgeImportBatch(importBatchId: string | null) {
  if (!importBatchId) return;

  try {
    const batch = await prisma.incidentKnowledgeImportBatch.findUnique({
      where: { id: importBatchId },
      select: { fileCount: true },
    });
    if (!batch) return;

    const documents = await prisma.incidentKnowledgeDocument.findMany({
      where: { importBatchId },
      select: { extractionStatus: true },
    });
    const progress = summarizeIncidentKnowledgeBatch(documents.map((document) => document.extractionStatus), batch.fileCount);

    await prisma.incidentKnowledgeImportBatch.update({
      where: { id: importBatchId },
      data: {
        processedCount: progress.processedCount,
        failedCount: progress.failedCount,
        status: progress.status,
        finishedAt: progress.finishedAt ? new Date() : null,
      },
    });
  } catch {
    // Batch counters are observability data; each document remains independently retryable.
  }
}
