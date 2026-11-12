import { createHash } from "node:crypto";
import {
  IncidentKnowledgeActionStatus,
  IncidentKnowledgeCauseAssessment,
  IncidentKnowledgeEvidenceStatus,
  IncidentKnowledgeExtractionStatus,
  IncidentKnowledgeReviewStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { StorageService } from "@/lib/services/storage-service";
import { extractIncidentPdf, type ExtractedIncidentPdfPage } from "@/lib/services/incident-knowledge-pdf-service";
import { extractIncidentKnowledgeDraftLocally } from "@/lib/services/incident-knowledge-extraction-service";
import { sanitizeIncidentKnowledgeText } from "@/lib/services/incident-knowledge-privacy";
import { refreshIncidentKnowledgeImportBatch } from "@/lib/services/incident-knowledge-import-batch-service";

export type IncidentKnowledgeExtractionJob = {
  documentId: string;
  plantId: string;
  attemptsMade?: number;
  maxAttempts?: number;
};

const CHUNK_CHARS = 3_500;
const EVIDENCE_EXCERPT_CHARS = 1_200;

function nullableDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function incidentCodeFromFilename(filename: string | null) {
  const match = filename?.match(/(?:^|[^A-Z0-9])S[- ]EWO[_ -]?(\d{2})(?=$|[^0-9])/i);
  return match ? `S-EWO-${match[1]}` : null;
}

function incidentTypeFromFilename(filename: string | null) {
  const normalized = filename?.toLocaleUpperCase("en").replace(/[^A-Z0-9]+/g, " ") ?? "";
  if (/\bNEAR MISS\b/.test(normalized)) return "Near miss";
  if (/\bFIRST AIDS?\b/.test(normalized)) return "First aid";
  if (/\bFATAL\b/.test(normalized)) return "Fatal accident";
  if (/\bSERIOUS\b/.test(normalized)) return "Serious injury";
  if (/\bMINOR\b/.test(normalized)) return "Minor injury";
  return null;
}

function incidentDateFromPages(pages: ExtractedIncidentPdfPage[]) {
  for (const page of pages) {
    const labelIndex = page.text.toLocaleUpperCase("en").indexOf("DATE:");
    if (labelIndex < 0) continue;
    const dateText = page.text.slice(labelIndex, labelIndex + 400);
    const match = dateText.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/);
    if (!match) continue;
    const [, day, month, year] = match;
    const value = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    const parsed = nullableDate(value);
    if (parsed) return parsed;
  }
  return null;
}

function splitPage(page: ExtractedIncidentPdfPage, startIndex: number) {
  const chunks: Array<{
    chunkIndex: number;
    pageStart: number;
    pageEnd: number;
    content: string;
    sanitizedContent: string;
    contentHash: string;
  }> = [];

  for (let offset = 0; offset < page.text.length; offset += CHUNK_CHARS) {
    const content = page.text.slice(offset, offset + CHUNK_CHARS).trim();
    if (!content) continue;
    chunks.push({
      chunkIndex: startIndex + chunks.length,
      pageStart: page.pageNumber,
      pageEnd: page.pageNumber,
      content,
      sanitizedContent: sanitizeIncidentKnowledgeText(content) ?? "",
      contentHash: createHash("sha256").update(content).digest("hex"),
    });
  }

  return chunks;
}

function toRecordData(draft: Awaited<ReturnType<typeof extractIncidentKnowledgeDraftLocally>>["draft"]) {
  return {
    incidentCode: draft?.incidentCode ?? null,
    incidentDate: nullableDate(draft?.incidentDate ?? null),
    department: draft?.department ?? null,
    workstation: draft?.workstation ?? null,
    equipment: draft?.equipment ?? null,
    shift: draft?.shift ?? null,
    operationType: draft?.operationType ?? null,
    occurrenceDescription: draft?.occurrenceDescription ?? null,
    occurrenceMechanism: draft?.occurrenceMechanism ?? null,
    injuryType: draft?.injuryType ?? null,
    bodyPart: draft?.bodyPart ?? null,
    consequence: draft?.consequence ?? null,
    immediateCorrectiveAction: draft?.immediateCorrectiveAction ?? null,
    lessonsLearned: draft?.lessonsLearned ?? null,
    previousRelatedOccurrences: draft?.previousRelatedOccurrences ?? null,
    sifPsifClassification: draft?.sifPsifClassification ?? null,
    extractionConfidence: draft?.extractionConfidence ?? null,
  };
}

function evidenceForPages(pages: ExtractedIncidentPdfPage[]) {
  return pages.filter((page) => page.text.trim()).map((page) => ({
    fieldName: "sourceText",
    extractedValue: page.text.slice(0, EVIDENCE_EXCERPT_CHARS),
    supportingExcerpt: page.text.slice(0, EVIDENCE_EXCERPT_CHARS),
    sourcePage: page.pageNumber,
    sourceSection: null,
    confidence: null,
    validationStatus: IncidentKnowledgeEvidenceStatus.UNREVIEWED,
  }));
}

function evidenceFromDraft(draft: NonNullable<Awaited<ReturnType<typeof extractIncidentKnowledgeDraftLocally>>["draft"]>) {
  return draft.evidence.map((evidence) => ({
    ...evidence,
    validationStatus: IncidentKnowledgeEvidenceStatus.UNREVIEWED,
  }));
}

export async function handleIncidentKnowledgeExtraction(job: IncidentKnowledgeExtractionJob) {
  const document = await prisma.incidentKnowledgeDocument.findUnique({
    where: { id: job.documentId },
    select: {
      id: true,
      plantId: true,
      importBatchId: true,
      originalFileKey: true,
      originalFilename: true,
      fileHash: true,
      extractionStatus: true,
      reviewStatus: true,
      documentVersion: true,
    },
  });

  if (!document || document.plantId !== job.plantId || !document.originalFileKey) return;
  if (document.reviewStatus === IncidentKnowledgeReviewStatus.APPROVED) return;

  await prisma.incidentKnowledgeDocument.update({
    where: { id: document.id },
    data: { extractionStatus: IncidentKnowledgeExtractionStatus.EXTRACTING, lastError: null },
  });

  try {
    const buffer = await StorageService.getObjectBuffer({ key: document.originalFileKey });
    const extracted = await extractIncidentPdf(buffer);
    if (document.fileHash && extracted.sha256 !== document.fileHash) {
      throw new Error("Stored document integrity check failed.");
    }

    if (extracted.requiresOcr) {
      const message = "The PDF has no usable text layer. Complete review manually from the original PDF; OCR is not configured.";
      await prisma.$transaction([
        prisma.incidentKnowledgeDocument.update({
          where: { id: document.id },
          data: { extractionStatus: IncidentKnowledgeExtractionStatus.FAILED, lastError: message },
        }),
        prisma.incidentKnowledgeAudit.create({
          data: {
            plantId: document.plantId,
            documentId: document.id,
            importBatchId: document.importBatchId,
            operation: "EXTRACTION_FAILED",
            changes: { reason: "OCR_REQUIRED", pageCount: extracted.pageCount },
            error: message,
          },
        }),
      ]);
      await refreshIncidentKnowledgeImportBatch(document.importBatchId);
      return;
    }

    const { draft, warning } = await extractIncidentKnowledgeDraftLocally(extracted.pages);
    const normalizedChunks = extracted.pages.flatMap((page) => splitPage(page, 0))
      .map((chunk, index) => ({ ...chunk, chunkIndex: index }));
    const fieldEvidence = [
      ...evidenceForPages(extracted.pages),
      ...(draft ? evidenceFromDraft(draft) : []),
    ];
    const extractedRecordData = toRecordData(draft);
    const filenameIncidentCode = incidentCodeFromFilename(document.originalFilename);
    const filenameIncidentType = incidentTypeFromFilename(document.originalFilename);
    const labeledIncidentDate = incidentDateFromPages(extracted.pages);
    const recordData = {
      ...extractedRecordData,
      incidentCode: filenameIncidentCode ?? extractedRecordData.incidentCode,
      incidentDate: labeledIncidentDate ?? extractedRecordData.incidentDate,
    };
    const incidentType = filenameIncidentType ?? draft?.incidentType ?? null;
    const causes = (draft?.causes ?? []).map((cause) => ({
      originalCauseCode: cause.originalCauseCode,
      originalCauseLabel: cause.originalCauseLabel,
      originalTaxonomyVersion: cause.originalTaxonomyVersion,
      normalizedCauseCode: cause.normalizedCauseCode,
      normalizedCategory: cause.normalizedCategory,
      description: cause.description,
      assessmentStatus: cause.assessmentStatus as IncidentKnowledgeCauseAssessment,
      sourcePage: cause.sourcePage,
      sourceSection: cause.sourceSection,
    }));
    const actions = (draft?.actions ?? []).map((action) => ({
      description: action.description,
      actionType: action.actionType,
      responsible: action.responsible,
      plannedClosureDate: nullableDate(action.plannedClosureDate),
      actualClosureDate: nullableDate(action.actualClosureDate),
      status: action.status as IncidentKnowledgeActionStatus,
      sourcePage: action.sourcePage,
      sourceSection: action.sourceSection,
    }));

    await prisma.$transaction(async (tx) => {
      await tx.incidentKnowledgeRecord.deleteMany({ where: { documentId: document.id } });
      await tx.incidentKnowledgeChunk.deleteMany({ where: { documentId: document.id } });
      await tx.incidentKnowledgeRecord.create({
        data: {
          documentId: document.id,
          plantId: document.plantId,
          ...recordData,
          causes: { create: causes },
          actions: { create: actions },
          evidences: { create: fieldEvidence },
        },
      });
      if (normalizedChunks.length) {
        await tx.incidentKnowledgeChunk.createMany({
          data: normalizedChunks.map((chunk) => ({
            documentId: document.id,
            plantId: document.plantId,
            ...chunk,
          })),
        });
      }
      await tx.incidentKnowledgeDocument.update({
        where: { id: document.id },
        data: {
          extractionStatus: IncidentKnowledgeExtractionStatus.PENDING_REVIEW,
          reviewStatus: IncidentKnowledgeReviewStatus.PENDING,
          indexedAt: null,
          reviewedById: null,
          reviewedAt: null,
          reviewComment: null,
          incidentDate: recordData.incidentDate,
          incidentType,
          lastError: warning,
        },
      });
      await tx.incidentKnowledgeAudit.create({
        data: {
          plantId: document.plantId,
          documentId: document.id,
          importBatchId: document.importBatchId,
          operation: "EXTRACTION_COMPLETED",
          changes: {
            pageCount: extracted.pageCount,
            textCharacters: extracted.totalTextCharacters,
            structuredDraftCreated: Boolean(draft),
            causeCount: causes.length,
            actionCount: actions.length,
            documentVersion: document.documentVersion,
            filenameDerivedIncidentCode: Boolean(filenameIncidentCode),
            filenameDerivedIncidentType: Boolean(filenameIncidentType),
            labelDerivedIncidentDate: Boolean(labeledIncidentDate),
          },
          error: warning,
        },
      });
    });

    await refreshIncidentKnowledgeImportBatch(document.importBatchId);
  } catch {
    const message = "PDF extraction failed. Retry processing or contact support.";
    const attemptsMade = job.attemptsMade ?? 0;
    const maxAttempts = job.maxAttempts ?? 1;
    const finalAttempt = attemptsMade + 1 >= maxAttempts;
    await prisma.$transaction([
      prisma.incidentKnowledgeDocument.update({
        where: { id: document.id },
        data: {
          extractionStatus: finalAttempt ? IncidentKnowledgeExtractionStatus.FAILED : IncidentKnowledgeExtractionStatus.EXTRACTING,
          lastError: finalAttempt ? message : "An extraction attempt failed. A retry is queued.",
        },
      }),
      prisma.incidentKnowledgeAudit.create({
        data: {
          plantId: document.plantId,
          documentId: document.id,
          importBatchId: document.importBatchId,
          operation: finalAttempt ? "EXTRACTION_FAILED" : "EXTRACTION_RETRY_SCHEDULED",
          changes: { documentVersion: document.documentVersion, attemptsMade: attemptsMade + 1, maxAttempts },
          error: finalAttempt ? message : "A transient extraction failure will be retried.",
        },
      }),
    ]);
    if (finalAttempt) await refreshIncidentKnowledgeImportBatch(document.importBatchId);
    throw new Error(message);
  }
}
