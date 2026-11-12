import { createHash } from "node:crypto";
import { IncidentKnowledgeCauseAssessment, IncidentKnowledgeReviewStatus, Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { sanitizeIncidentKnowledgeEmbeddingText } from "@/lib/services/incident-knowledge-privacy";

const EMBEDDING_DIMENSIONS = 1536;
const MAX_CHUNK_CHARS = 5_000;

type EmbeddingResponse = { data?: Array<{ index?: number; embedding?: number[] }> };

type IndexChunk = {
  chunkIndex: number;
  sectionName: string;
  pageStart: number | null;
  pageEnd: number | null;
  content: string;
  contentHash: string;
};

function trimToLimit(value: string, limit = MAX_CHUNK_CHARS) {
  return value.length > limit ? `${value.slice(0, limit).trimEnd()}…` : value;
}

function safeChunk(sectionName: string, text: string | null | undefined, page: number | null): Omit<IndexChunk, "chunkIndex"> | null {
  const safeText = sanitizeIncidentKnowledgeEmbeddingText(text);
  if (!safeText) return null;
  const content = trimToLimit(safeText);
  return {
    sectionName,
    pageStart: page,
    pageEnd: page,
    content,
    contentHash: createHash("sha256").update(content).digest("hex"),
  };
}

function pageForField(evidences: Array<{ fieldName: string; sourcePage: number | null }>, fieldName: string) {
  return evidences.find((evidence) => evidence.fieldName === fieldName)?.sourcePage ?? null;
}

export function buildIncidentKnowledgeIndexChunks(input: {
  incidentType: string | null;
  incidentYear: number | null;
  record: {
    department: string | null;
    workstation: string | null;
    equipment: string | null;
    operationType: string | null;
    occurrenceDescription: string | null;
    occurrenceMechanism: string | null;
    immediateCorrectiveAction: string | null;
    lessonsLearned: string | null;
    evidences: Array<{ fieldName: string; sourcePage: number | null }>;
    causes: Array<{
      originalCauseCode: string | null;
      originalCauseLabel: string | null;
      normalizedCategory: string | null;
      description: string | null;
      assessmentStatus: IncidentKnowledgeCauseAssessment;
      sourcePage: number | null;
    }>;
    actions: Array<{
      description: string;
      actionType: string | null;
      status: string;
      sourcePage: number | null;
    }>;
  } | null;
}) {
  const record = input.record;
  if (!record) return [] as IndexChunk[];

  const candidates = [
    safeChunk("Occurrence context", [
      input.incidentType ? `Occurrence type: ${input.incidentType}` : null,
      input.incidentYear ? `Year: ${input.incidentYear}` : null,
      record.department ? `Department: ${record.department}` : null,
      record.workstation ? `Work area: ${record.workstation}` : null,
      record.equipment ? `Equipment: ${record.equipment}` : null,
      record.operationType ? `Operation: ${record.operationType}` : null,
      record.occurrenceDescription ? `Reviewed description: ${record.occurrenceDescription}` : null,
      record.occurrenceMechanism ? `Mechanism: ${record.occurrenceMechanism}` : null,
    ].filter(Boolean).join("\n"), pageForField(record.evidences, "occurrenceDescription")),
    safeChunk("Corrective action and lessons", [
      record.immediateCorrectiveAction ? `Documented immediate action: ${record.immediateCorrectiveAction}` : null,
      record.lessonsLearned ? `Documented lesson: ${record.lessonsLearned}` : null,
    ].filter(Boolean).join("\n"), pageForField(record.evidences, "lessonsLearned")),
    ...record.causes.map((cause) => safeChunk(
      cause.assessmentStatus === IncidentKnowledgeCauseAssessment.CONFIRMED ? "Cause assessment: confirmed" : `Cause assessment: ${cause.assessmentStatus.toLowerCase()}`,
      [
        `Assessment: ${cause.assessmentStatus}`,
        cause.originalCauseCode ? `Original cause code: ${cause.originalCauseCode}` : null,
        cause.originalCauseLabel ? `Original cause: ${cause.originalCauseLabel}` : null,
        cause.normalizedCategory ? `Category: ${cause.normalizedCategory}` : null,
        cause.description ? `Description: ${cause.description}` : null,
      ].filter(Boolean).join("\n"),
      cause.sourcePage,
    )),
    ...record.actions.map((action) => safeChunk(
      "Documented corrective or preventive action",
      [
        action.actionType ? `Action type: ${action.actionType}` : null,
        `Action status: ${action.status}`,
        `Documented action: ${action.description}`,
      ].filter(Boolean).join("\n"),
      action.sourcePage,
    )),
  ].filter((chunk): chunk is Omit<IndexChunk, "chunkIndex"> => Boolean(chunk));

  return candidates.map((chunk, chunkIndex) => ({ ...chunk, chunkIndex }));
}

export async function createIncidentKnowledgeEmbeddings(texts: string[], signal?: AbortSignal) {
  if (!env.OPENAI_API_KEY) throw new Error("OpenAI embedding service is not configured.");
  if (!texts.length) return [];

  const response = await fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, "")}/embeddings`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_EMBEDDING_MODEL,
      input: texts,
      encoding_format: "float",
    }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`OpenAI embedding request failed (${response.status}).`);

  const result = await response.json() as EmbeddingResponse;
  const vectors = (result.data ?? []).slice().sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
  if (vectors.length !== texts.length || vectors.some((item) => !Array.isArray(item.embedding) || item.embedding.length !== EMBEDDING_DIMENSIONS)) {
    throw new Error("OpenAI returned embeddings with an unexpected shape.");
  }
  return vectors.map((item) => item.embedding as number[]);
}

export async function indexApprovedIncidentKnowledgeDocument(documentId: string, plantId: string) {
  const document = await prisma.incidentKnowledgeDocument.findFirst({
    where: {
      id: documentId,
      plantId,
      archivedAt: null,
      reviewStatus: IncidentKnowledgeReviewStatus.APPROVED,
    },
    select: {
      id: true,
      plantId: true,
      incidentType: true,
      incidentDate: true,
      record: {
        select: {
          department: true,
          workstation: true,
          equipment: true,
          operationType: true,
          occurrenceDescription: true,
          occurrenceMechanism: true,
          immediateCorrectiveAction: true,
          lessonsLearned: true,
          evidences: { select: { fieldName: true, sourcePage: true } },
          causes: {
            select: {
              originalCauseCode: true,
              originalCauseLabel: true,
              normalizedCategory: true,
              description: true,
              assessmentStatus: true,
              sourcePage: true,
            },
          },
          actions: {
            select: { description: true, actionType: true, status: true, sourcePage: true },
          },
        },
      },
    },
  });
  if (!document) return false;

  const chunks = buildIncidentKnowledgeIndexChunks({
    incidentType: document.incidentType,
    incidentYear: document.incidentDate?.getUTCFullYear() ?? null,
    record: document.record,
  });
  if (!chunks.length) throw new Error("The approved document has no privacy-filtered content to index.");

  // Only these reviewed and minimized fields are sent; the PDF, raw page text,
  // worker IDs, medical fields, action owners and exact dates are excluded.
  // Detected names and contact details are redacted by the privacy sanitizer.
  const embeddings = await createIncidentKnowledgeEmbeddings(chunks.map((chunk) => chunk.content));
  const committed = await prisma.$transaction(async (tx) => {
    const stillApproved = await tx.incidentKnowledgeDocument.findFirst({
      where: {
        id: documentId,
        plantId,
        archivedAt: null,
        reviewStatus: IncidentKnowledgeReviewStatus.APPROVED,
      },
      select: { id: true },
    });
    if (!stillApproved) return false;

    await tx.incidentKnowledgeChunk.deleteMany({ where: { documentId, plantId } });
    await tx.incidentKnowledgeChunk.createMany({
      data: chunks.map((chunk) => ({
        documentId,
        plantId,
        ...chunk,
        sanitizedContent: chunk.content,
        embeddingModel: env.OPENAI_EMBEDDING_MODEL,
        embeddingDimensions: EMBEDDING_DIMENSIONS,
      })),
    });
    for (const chunk of chunks) {
      const vector = `[${embeddings[chunk.chunkIndex].join(",")}]`;
      await tx.$executeRaw(Prisma.sql`
        UPDATE "IncidentKnowledgeChunk"
        SET "embedding" = ${vector}::vector
        WHERE "documentId" = ${documentId}
          AND "plantId" = ${plantId}
          AND "chunkIndex" = ${chunk.chunkIndex}
      `);
    }
    return true;
  });

  return committed;
}
