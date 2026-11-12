import { randomUUID } from "node:crypto";
import {
  IncidentKnowledgeExtractionStatus,
  IncidentKnowledgeReviewStatus,
  IncidentKnowledgeSourceType,
} from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { canManageIncidentKnowledge, canViewUnapprovedIncidentKnowledge, INCIDENT_KNOWLEDGE_VIEW_ROLES } from "@/lib/incident-knowledge-access";
import { logger } from "@/lib/logger";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { incidentKnowledgeExtractionQueue } from "@/jobs/queues";
import { StorageService } from "@/lib/services/storage-service";
import { getIncidentPdfSha256, validateIncidentPdfBuffer } from "@/lib/services/incident-knowledge-pdf-service";
import { refreshIncidentKnowledgeImportBatch } from "@/lib/services/incident-knowledge-import-batch-service";
import { sanitizeIncidentKnowledgeText } from "@/lib/services/incident-knowledge-privacy";

const MAX_BATCH_FILES = 5;
const MAX_BATCH_BYTES = 50 * 1024 * 1024;

function safeFileName(fileName: string) {
  const normalized = fileName
    .normalize("NFKC")
    .replace(/[\\/\r\n\u0000-\u001f]/g, "_")
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .trim()
    .slice(0, 180);
  return normalized.toLowerCase().endsWith(".pdf") ? normalized : `${normalized || "incident"}.pdf`;
}

export async function GET(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, INCIDENT_KNOWLEDGE_VIEW_ROLES);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const canSeeAll = canViewUnapprovedIncidentKnowledge(auth.session.user.plantRoles, plantCode);
  const params = new URL(request.url).searchParams;
  const search = params.get("q")?.trim().slice(0, 120);
  const status = params.get("status");
  const skip = Number(params.get("skip") ?? 0);
  if (!Number.isSafeInteger(skip) || skip < 0 || skip > 100_000) return fail("INVALID_PAGE", "The document page is invalid.", 400);
  const where = {
    plantId: plant.id,
    archivedAt: null,
    ...(canSeeAll ? {} : { reviewStatus: IncidentKnowledgeReviewStatus.APPROVED }),
    ...(Object.values(IncidentKnowledgeExtractionStatus).includes(status as IncidentKnowledgeExtractionStatus)
      ? { extractionStatus: status as IncidentKnowledgeExtractionStatus }
      : {}),
    ...(search ? {
      OR: [
        { sourceReference: { contains: search, mode: "insensitive" as const } },
        { originalFilename: { contains: search, mode: "insensitive" as const } },
        { record: { is: { incidentCode: { contains: search, mode: "insensitive" as const } } } },
      ],
    } : {}),
  };

  const documents = await prisma.incidentKnowledgeDocument.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip,
    take: 100,
    select: {
      id: true,
      sourceType: true,
      sourceReference: true,
      originalFilename: true,
      incidentDate: true,
      incidentType: true,
      extractionStatus: true,
      reviewStatus: true,
      lastError: true,
      reviewComment: true,
      createdAt: true,
      record: {
        select: {
          incidentCode: true,
          department: true,
          occurrenceDescription: true,
        },
      },
    },
  });

  const canManage = canManageIncidentKnowledge(auth.session.user.plantRoles, plantCode);
  const visibleDocuments = canManage ? documents : documents.map((document) => ({
    ...document,
    sourceReference: sanitizeIncidentKnowledgeText(document.sourceReference),
    originalFilename: sanitizeIncidentKnowledgeText(document.originalFilename),
    lastError: sanitizeIncidentKnowledgeText(document.lastError),
    reviewComment: sanitizeIncidentKnowledgeText(document.reviewComment),
    record: document.record ? {
      ...document.record,
      occurrenceDescription: sanitizeIncidentKnowledgeText(document.record.occurrenceDescription),
    } : null,
  }));
  return ok({ documents: visibleDocuments, canManage, nextSkip: skip + documents.length, hasMore: documents.length === 100 });
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, INCIDENT_KNOWLEDGE_VIEW_ROLES);
  if ("error" in auth) return auth.error;
  if (!canManageIncidentKnowledge(auth.session.user.plantRoles, plantCode)) {
    return fail("FORBIDDEN", "Only HSE reviewers can import historical S-EWO documents.", 403);
  }

  const form = await request.formData().catch(() => null);
  if (!form) return fail("INVALID_FORM", "Upload one or more PDF files.", 400);
  const files = form.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
  if (!files.length || files.length > MAX_BATCH_FILES) {
    return fail("INVALID_FILE_COUNT", `Upload between 1 and ${MAX_BATCH_FILES} PDF files per batch.`, 400);
  }

  const plant = await getPlantByCode(plantCode);
  const prepared: Array<{ id: string; fileName: string; buffer: Buffer; fileHash: string; key: string }> = [];
  let batchBytes = 0;

  try {
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      validateIncidentPdfBuffer(buffer);
      batchBytes += buffer.byteLength;
      if (batchBytes > MAX_BATCH_BYTES) {
        return fail("BATCH_TOO_LARGE", "The combined size of a batch must be 50 MiB or smaller.", 413);
      }
      const id = randomUUID();
      const fileName = safeFileName(file.name);
      prepared.push({
        id,
        fileName,
        buffer,
        fileHash: getIncidentPdfSha256(buffer),
        key: `${plant.code}/incident-knowledge/${id}/${fileName}`,
      });
    }
  } catch (error) {
    return fail("INVALID_PDF", error instanceof Error ? error.message : "One of the uploaded files is invalid.", 400);
  }

  const uniqueHashes = new Set(prepared.map((file) => file.fileHash));
  if (uniqueHashes.size !== prepared.length) {
    return fail("DUPLICATE_IN_BATCH", "The batch contains duplicate PDF files.", 409);
  }

  const existing = await prisma.incidentKnowledgeDocument.findMany({
    where: { fileHash: { in: prepared.map((file) => file.fileHash) } },
    select: { fileHash: true },
  });
  if (existing.length) return fail("DUPLICATE_DOCUMENT", "One or more PDFs have already been imported into the shared Knowledge Base.", 409);

  const batchId = randomUUID();
  await prisma.incidentKnowledgeImportBatch.create({
    data: {
      id: batchId,
      plantId: plant.id,
      uploadedById: auth.session.user.id,
      fileCount: prepared.length,
      status: "PROCESSING",
      startedAt: new Date(),
    },
  });

  const uploadedKeys: string[] = [];
  try {
    for (const file of prepared) {
      await StorageService.uploadObject({ key: file.key, contentType: "application/pdf", body: file.buffer });
      uploadedKeys.push(file.key);
    }

    await prisma.$transaction(async (tx) => {
      await tx.incidentKnowledgeDocument.createMany({
        data: prepared.map((file) => ({
          id: file.id,
          plantId: plant.id,
          importBatchId: batchId,
          sourceType: IncidentKnowledgeSourceType.HISTORICAL_PDF,
          sourceReference: file.fileName,
          originalFilename: file.fileName,
          originalFileKey: file.key,
          fileHash: file.fileHash,
          fileSize: BigInt(file.buffer.byteLength),
          mimeType: "application/pdf",
          uploadedById: auth.session.user.id,
          extractionStatus: IncidentKnowledgeExtractionStatus.UPLOADED,
          reviewStatus: IncidentKnowledgeReviewStatus.PENDING,
        })),
      });
      await tx.incidentKnowledgeAudit.createMany({
        data: prepared.map((file) => ({
          plantId: plant.id,
          documentId: file.id,
          importBatchId: batchId,
          actorUserId: auth.session.user.id,
          operation: "PDF_UPLOADED",
          changes: { sha256: file.fileHash, sizeBytes: file.buffer.byteLength },
        })),
      });
    });
  } catch (error) {
    await Promise.allSettled(uploadedKeys.map((key) => StorageService.deleteObject({ key })));
    await prisma.incidentKnowledgeImportBatch.update({ where: { id: batchId }, data: { status: "FAILED", failedCount: prepared.length, finishedAt: new Date() } });
    logger.error({ error, plantCode, batchId }, "incident_knowledge_pdf_upload_failed");
    return fail("UPLOAD_FAILED", "The PDFs could not be stored. No documents were added to the Knowledge Base.", 500);
  }

  const queuedIds: string[] = [];
  for (const file of prepared) {
    try {
      await incidentKnowledgeExtractionQueue.add("extract", { documentId: file.id, plantId: plant.id }, {
        jobId: `incident-knowledge-${file.id}-v1`,
        attempts: 2,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      });
      queuedIds.push(file.id);
    } catch (error) {
      await prisma.incidentKnowledgeDocument.update({
        where: { id: file.id },
        data: { extractionStatus: IncidentKnowledgeExtractionStatus.FAILED, lastError: "The extraction queue is unavailable. Retry processing from the review page." },
      });
      await prisma.incidentKnowledgeAudit.create({
        data: {
          plantId: plant.id,
          documentId: file.id,
          importBatchId: batchId,
          actorUserId: auth.session.user.id,
          operation: "EXTRACTION_QUEUE_FAILED",
          changes: { extractionStatus: IncidentKnowledgeExtractionStatus.FAILED },
          error: "The extraction queue could not accept this document.",
        },
      });
      logger.error({ error, plantCode, documentId: file.id }, "incident_knowledge_extraction_queue_failed");
    }
  }

  await refreshIncidentKnowledgeImportBatch(batchId);

  return ok({
    batchId,
    documents: prepared.map((file) => ({ id: file.id, originalFilename: file.fileName })),
    queuedCount: queuedIds.length,
  }, { status: 201 });
}
