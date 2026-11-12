import { z } from "zod";
import { IncidentKnowledgeActionStatus, IncidentKnowledgeCauseAssessment, IncidentKnowledgeExtractionStatus, IncidentKnowledgeReviewStatus } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { canManageIncidentKnowledge, canViewUnapprovedIncidentKnowledge, INCIDENT_KNOWLEDGE_VIEW_ROLES } from "@/lib/incident-knowledge-access";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { sanitizeIncidentKnowledgeText } from "@/lib/services/incident-knowledge-privacy";

const nullableText = z.string().trim().max(12_000).nullable();
function isValidDateOnly(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const nullableDate = z.string().refine(isValidDateOnly, "Enter a real calendar date.").nullable();

const reviewInput = z.object({
  incidentType: nullableText,
  record: z.object({
    incidentCode: nullableText,
    incidentDate: nullableDate,
    department: nullableText,
    workstation: nullableText,
    equipment: nullableText,
    shift: nullableText,
    operationType: nullableText,
    occurrenceDescription: nullableText,
    occurrenceMechanism: nullableText,
    injuryType: nullableText,
    bodyPart: nullableText,
    consequence: nullableText,
    immediateCorrectiveAction: nullableText,
    lessonsLearned: nullableText,
    previousRelatedOccurrences: nullableText,
    sifPsifClassification: nullableText,
  }).strict(),
  causes: z.array(z.object({
    originalCauseCode: nullableText,
    originalCauseLabel: nullableText,
    originalTaxonomyVersion: nullableText,
    normalizedCauseCode: nullableText,
    normalizedCategory: nullableText,
    description: nullableText,
    assessmentStatus: z.nativeEnum(IncidentKnowledgeCauseAssessment),
    sourcePage: z.number().int().positive().nullable(),
    sourceSection: nullableText,
  }).strict()).max(50),
  actions: z.array(z.object({
    description: z.string().trim().min(1).max(12_000),
    actionType: nullableText,
    responsible: nullableText,
    plannedClosureDate: nullableDate,
    actualClosureDate: nullableDate,
    status: z.nativeEnum(IncidentKnowledgeActionStatus),
    sourcePage: z.number().int().positive().nullable(),
    sourceSection: nullableText,
  }).strict()).max(100),
}).strict();

function parseDate(value: string | null) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ plantCode: string; documentId: string }> },
) {
  const { plantCode, documentId } = await context.params;
  const auth = await requirePlantAccess(plantCode, INCIDENT_KNOWLEDGE_VIEW_ROLES);
  if ("error" in auth) return auth.error;
  const canSeeAll = canViewUnapprovedIncidentKnowledge(auth.session.user.plantRoles, plantCode);
  const plant = await getPlantByCode(plantCode);
  const document = await prisma.incidentKnowledgeDocument.findFirst({
    where: {
      id: documentId,
      plantId: plant.id,
      archivedAt: null,
      ...(canSeeAll ? {} : { reviewStatus: IncidentKnowledgeReviewStatus.APPROVED }),
    },
    select: {
      id: true,
      sourceType: true,
      sourceReference: true,
      originalFilename: true,
      incidentDate: true,
      incidentType: true,
      extractionStatus: true,
      reviewStatus: true,
      documentVersion: true,
      lastError: true,
      reviewComment: true,
      createdAt: true,
      reviewedAt: true,
      record: {
        include: {
          causes: { orderBy: { createdAt: "asc" } },
          actions: { orderBy: { createdAt: "asc" } },
          evidences: { orderBy: [{ sourcePage: "asc" }, { fieldName: "asc" }] },
        },
      },
    },
  });
  if (!document) return fail("NOT_FOUND", "Knowledge Base document not found.", 404);

  const canManage = canManageIncidentKnowledge(auth.session.user.plantRoles, plantCode);
  if (canManage) return ok({ document, canManage });

  const sanitizeRecordText = (value: string | null) => sanitizeIncidentKnowledgeText(value);
  const safeDocument = {
    ...document,
    sourceReference: sanitizeIncidentKnowledgeText(document.sourceReference),
    originalFilename: sanitizeIncidentKnowledgeText(document.originalFilename),
    lastError: sanitizeIncidentKnowledgeText(document.lastError),
    reviewComment: sanitizeIncidentKnowledgeText(document.reviewComment),
    record: document.record ? {
      ...document.record,
      occurrenceDescription: sanitizeRecordText(document.record.occurrenceDescription),
      occurrenceMechanism: sanitizeRecordText(document.record.occurrenceMechanism),
      consequence: sanitizeRecordText(document.record.consequence),
      immediateCorrectiveAction: sanitizeRecordText(document.record.immediateCorrectiveAction),
      lessonsLearned: sanitizeRecordText(document.record.lessonsLearned),
      previousRelatedOccurrences: sanitizeRecordText(document.record.previousRelatedOccurrences),
      causes: document.record.causes.map((cause) => ({
        ...cause,
        description: sanitizeRecordText(cause.description),
      })),
      actions: document.record.actions.map((action) => ({
        ...action,
        description: sanitizeIncidentKnowledgeText(action.description) ?? "",
        responsible: sanitizeIncidentKnowledgeText(action.responsible),
      })),
      evidences: [],
    } : null,
  };

  return ok({ document: safeDocument, canManage });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ plantCode: string; documentId: string }> },
) {
  const { plantCode, documentId } = await context.params;
  const auth = await requirePlantAccess(plantCode, INCIDENT_KNOWLEDGE_VIEW_ROLES);
  if ("error" in auth) return auth.error;
  if (!canManageIncidentKnowledge(auth.session.user.plantRoles, plantCode)) {
    return fail("FORBIDDEN", "Only an HSE reviewer can change extracted fields.", 403);
  }
  const body = await request.json().catch(() => null);
  const parsed = reviewInput.safeParse(body);
  if (!parsed.success) return fail("INVALID_REVIEW", "The review fields are invalid.", 400);

  const plant = await getPlantByCode(plantCode);
  const document = await prisma.incidentKnowledgeDocument.findFirst({
    where: { id: documentId, plantId: plant.id, archivedAt: null },
    select: { id: true, reviewStatus: true, extractionStatus: true, incidentDate: true, incidentType: true },
  });
  if (!document) return fail("NOT_FOUND", "Knowledge Base document not found.", 404);
  if (document.reviewStatus === IncidentKnowledgeReviewStatus.APPROVED) {
    return fail("REPROCESS_REQUIRED", "Approved documents must be reprocessed into a new review before edits.", 409);
  }
  if (document.reviewStatus === IncidentKnowledgeReviewStatus.REJECTED) {
    return fail("REPROCESS_REQUIRED", "Rejected documents must be reprocessed before editing.", 409);
  }
  if (document.extractionStatus === IncidentKnowledgeExtractionStatus.UPLOADED
    || document.extractionStatus === IncidentKnowledgeExtractionStatus.EXTRACTING
    || document.extractionStatus === IncidentKnowledgeExtractionStatus.INDEXING) {
    return fail("EXTRACTION_IN_PROGRESS", "Wait for extraction to finish before editing this document.", 409);
  }

  const input = parsed.data;
  const date = parseDate(input.record.incidentDate);
  const changedFields = Object.keys(input.record);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.incidentKnowledgeRecord.findUnique({
      where: { documentId },
      select: { id: true, incidentCode: true, incidentDate: true, department: true, equipment: true, sifPsifClassification: true },
    });
    const previousState = existing ? {
      incidentCode: existing.incidentCode,
      incidentDate: existing.incidentDate?.toISOString().slice(0, 10) ?? null,
      department: existing.department,
      equipment: existing.equipment,
      sifPsifClassification: existing.sifPsifClassification,
      reviewStatus: document.reviewStatus,
    } : { recordPresent: false, reviewStatus: document.reviewStatus };

    const recordFields = {
      ...input.record,
      incidentDate: date,
      extractionConfidence: existing ? undefined : null,
      reviewedAt: null,
    };

    if (existing) {
      await tx.incidentKnowledgeCause.deleteMany({ where: { incidentRecordId: existing.id } });
      await tx.incidentKnowledgeAction.deleteMany({ where: { incidentRecordId: existing.id } });
      await tx.incidentKnowledgeRecord.update({ where: { id: existing.id }, data: recordFields });
    } else {
      await tx.incidentKnowledgeRecord.create({ data: { ...recordFields, plantId: plant.id, documentId } });
    }

    const savedRecord = await tx.incidentKnowledgeRecord.findUniqueOrThrow({
      where: { documentId },
      select: { id: true },
    });
    if (input.causes.length) {
      await tx.incidentKnowledgeCause.createMany({
        data: input.causes.map((cause) => ({ ...cause, incidentRecordId: savedRecord.id })),
      });
    }
    if (input.actions.length) {
      await tx.incidentKnowledgeAction.createMany({
        data: input.actions.map((action) => ({
          ...action,
          plannedClosureDate: parseDate(action.plannedClosureDate),
          actualClosureDate: parseDate(action.actualClosureDate),
          incidentRecordId: savedRecord.id,
        })),
      });
    }

    await tx.incidentKnowledgeDocument.update({
      where: { id: documentId },
      data: {
        incidentDate: date,
        incidentType: input.incidentType,
        extractionStatus: IncidentKnowledgeExtractionStatus.PENDING_REVIEW,
        reviewStatus: IncidentKnowledgeReviewStatus.PENDING,
        lastError: null,
        reviewedById: null,
        reviewedAt: null,
        reviewComment: null,
      },
    });
    await tx.incidentKnowledgeAudit.create({
      data: {
        plantId: plant.id,
        documentId,
        actorUserId: auth.session.user.id,
        operation: "REVIEW_FIELDS_SAVED",
        changes: { changedFields, causeCount: input.causes.length, actionCount: input.actions.length },
        stateBefore: previousState,
        stateAfter: {
          incidentCode: input.record.incidentCode,
          incidentDate: input.record.incidentDate,
          department: input.record.department,
          equipment: input.record.equipment,
          sifPsifClassification: input.record.sifPsifClassification,
          reviewStatus: IncidentKnowledgeReviewStatus.PENDING,
        },
      },
    });
  });

  return ok({ saved: true });
}
