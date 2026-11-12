import { z } from "zod";
import { IncidentKnowledgeExtractionStatus, IncidentKnowledgeReviewStatus, IncidentKnowledgeSourceType, SEWOStatus } from "@prisma/client";
import { incidentKnowledgeIndexQueue, incidentKnowledgeSewoSyncQueue } from "@/jobs/queues";
import { fail, ok } from "@/lib/api";
import { canManageIncidentKnowledge, INCIDENT_KNOWLEDGE_VIEW_ROLES } from "@/lib/incident-knowledge-access";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";

const decisionInput = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().trim().max(4_000).nullable().optional(),
}).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ plantCode: string; documentId: string }> },
) {
  const { plantCode, documentId } = await context.params;
  const auth = await requirePlantAccess(plantCode, INCIDENT_KNOWLEDGE_VIEW_ROLES);
  if ("error" in auth) return auth.error;
  if (!canManageIncidentKnowledge(auth.session.user.plantRoles, plantCode)) {
    return fail("FORBIDDEN", "Only an HSE reviewer can approve or reject a document.", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = decisionInput.safeParse(body);
  if (!parsed.success) return fail("INVALID_DECISION", "Choose approve or reject.", 400);
  if (parsed.data.decision === "REJECT" && !parsed.data.comment?.trim()) {
    return fail("REJECTION_COMMENT_REQUIRED", "Add a short reason before rejecting the document.", 400);
  }

  const plant = await getPlantByCode(plantCode);
  const document = await prisma.incidentKnowledgeDocument.findFirst({
    where: { id: documentId, plantId: plant.id, archivedAt: null },
    select: {
      id: true,
      sourceType: true,
      incidentDate: true,
      reviewStatus: true,
      extractionStatus: true,
      record: { select: { incidentCode: true, incidentDate: true, occurrenceDescription: true, occurrenceMechanism: true } },
    },
  });
  if (!document) return fail("NOT_FOUND", "Knowledge Base document not found.", 404);
  if (document.reviewStatus !== IncidentKnowledgeReviewStatus.PENDING
    || document.extractionStatus !== IncidentKnowledgeExtractionStatus.PENDING_REVIEW) {
    return fail("DOCUMENT_NOT_REVIEWABLE", "Only documents in HSE review can be approved or rejected.", 409);
  }

  if (parsed.data.decision === "APPROVE"
    && !document.record?.incidentCode
    && !document.record?.occurrenceDescription
    && !document.record?.occurrenceMechanism) {
    return fail("REVIEW_INCOMPLETE", "Add an incident code or occurrence description before approval.", 422);
  }

  const approved = parsed.data.decision === "APPROVE";
  const now = new Date();
  await prisma.$transaction([
    prisma.incidentKnowledgeDocument.update({
      where: { id: document.id },
      data: {
        reviewStatus: approved ? IncidentKnowledgeReviewStatus.APPROVED : IncidentKnowledgeReviewStatus.REJECTED,
        extractionStatus: approved ? IncidentKnowledgeExtractionStatus.INDEXING : IncidentKnowledgeExtractionStatus.REJECTED,
        reviewedById: auth.session.user.id,
        reviewedAt: now,
        reviewComment: parsed.data.comment?.trim() || null,
        lastError: null,
        indexedAt: null,
      },
    }),
    prisma.incidentKnowledgeRecord.updateMany({
      where: { documentId: document.id },
      data: { reviewedAt: now },
    }),
    prisma.incidentKnowledgeAudit.create({
      data: {
        plantId: plant.id,
        documentId: document.id,
        actorUserId: auth.session.user.id,
        operation: approved ? "DOCUMENT_APPROVED" : "DOCUMENT_REJECTED",
        changes: { reviewStatus: approved ? "APPROVED" : "REJECTED" },
        stateBefore: { reviewStatus: document.reviewStatus, extractionStatus: document.extractionStatus },
        stateAfter: {
          reviewStatus: approved ? "APPROVED" : "REJECTED",
          extractionStatus: approved ? "INDEXING" : "REJECTED",
        },
      },
    }),
  ]);

  let indexingQueued = false;
  let duplicateCheckQueued = false;
  if (approved) {
    try {
      await incidentKnowledgeIndexQueue.add("index-approved-document", { documentId, plantId: plant.id }, {
        jobId: `incident-knowledge-index-${documentId}-v${now.getTime()}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 3_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      });
      indexingQueued = true;
    } catch {
      const message = "Search indexing could not be queued. The approved incident remains available through text and structured search; retry indexing from HSE review.";
      await prisma.$transaction([
        prisma.incidentKnowledgeDocument.update({
          where: { id: document.id },
          data: { extractionStatus: IncidentKnowledgeExtractionStatus.APPROVED, indexedAt: null, lastError: message },
        }),
        prisma.incidentKnowledgeAudit.create({
          data: {
            plantId: plant.id,
            documentId: document.id,
            actorUserId: auth.session.user.id,
            operation: "DOCUMENT_INDEXING_QUEUE_FAILED",
            changes: { extractionStatus: IncidentKnowledgeExtractionStatus.APPROVED },
            error: message,
          },
        }),
      ]);
    }

    if (document.sourceType === IncidentKnowledgeSourceType.HISTORICAL_PDF) {
      const incidentDate = document.record?.incidentDate ?? document.incidentDate;
      const monthStart = incidentDate ? new Date(Date.UTC(incidentDate.getUTCFullYear(), incidentDate.getUTCMonth(), 1)) : null;
      const nextMonth = incidentDate ? new Date(Date.UTC(incidentDate.getUTCFullYear(), incidentDate.getUTCMonth() + 1, 1)) : null;
      const candidateFilters = [
        ...(monthStart && nextMonth ? [{ analysisDate: { gte: monthStart, lt: nextMonth } }] : []),
        ...(document.record?.incidentCode ? [{ codigoSewo: document.record.incidentCode }] : []),
      ];

      if (candidateFilters.length) {
        try {
          const currentSewos = await prisma.sEWO.findMany({
            where: {
              plantId: plant.id,
              deletedAt: null,
              status: { in: [SEWOStatus.APPROVED, SEWOStatus.CLOSED] },
              OR: [{ approvedAt: { not: null } }, { approvedByUserId: { not: null } }],
              AND: [{ OR: candidateFilters }],
            },
            select: { id: true, updatedAt: true },
            orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
          });

          if (currentSewos.length) {
            await incidentKnowledgeSewoSyncQueue.addBulk(currentSewos.map((sewo) => ({
              name: "check-historical-sewo-duplicate",
              data: { sewoId: sewo.id, plantId: plant.id, actorUserId: auth.session.user.id },
              opts: {
                jobId: `incident-knowledge-historical-dedupe:${document.id}:${sewo.id}:${now.getTime()}`,
                attempts: 3,
                backoff: { type: "exponential" as const, delay: 3_000 },
                removeOnComplete: 100,
                removeOnFail: 500,
              },
            })));
          }
          await prisma.incidentKnowledgeAudit.create({
            data: {
              plantId: plant.id,
              documentId: document.id,
              actorUserId: auth.session.user.id,
              operation: "HISTORICAL_SEWO_DUPLICATE_CHECK_QUEUED",
              changes: { candidateCount: currentSewos.length },
            },
          });
          duplicateCheckQueued = true;
        } catch {
          await prisma.incidentKnowledgeAudit.create({
            data: {
              plantId: plant.id,
              documentId: document.id,
              actorUserId: auth.session.user.id,
              operation: "HISTORICAL_SEWO_DUPLICATE_CHECK_QUEUE_FAILED",
              error: "Could not queue a duplicate check against current S-EWO records.",
            },
          });
        }
      }
    }
  }

  return ok({ documentId, reviewStatus: approved ? "APPROVED" : "REJECTED", reviewedAt: now, indexingQueued, duplicateCheckQueued });
}
