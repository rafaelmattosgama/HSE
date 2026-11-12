import { NextResponse } from "next/server";
import { IncidentKnowledgeReviewStatus } from "@prisma/client";
import { fail } from "@/lib/api";
import { canManageIncidentKnowledge, INCIDENT_KNOWLEDGE_VIEW_ROLES } from "@/lib/incident-knowledge-access";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { StorageService } from "@/lib/services/storage-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ plantCode: string; documentId: string }> },
) {
  const { plantCode, documentId } = await context.params;
  const auth = await requirePlantAccess(plantCode, INCIDENT_KNOWLEDGE_VIEW_ROLES);
  if ("error" in auth) return auth.error;
  if (!canManageIncidentKnowledge(auth.session.user.plantRoles, plantCode)) {
    return fail("FORBIDDEN", "Only HSE reviewers can access original incident PDFs.", 403);
  }

  const plant = await getPlantByCode(plantCode);
  const document = await prisma.incidentKnowledgeDocument.findFirst({
    where: {
      id: documentId,
      plantId: plant.id,
      archivedAt: null,
      reviewStatus: { in: [IncidentKnowledgeReviewStatus.PENDING, IncidentKnowledgeReviewStatus.APPROVED, IncidentKnowledgeReviewStatus.REJECTED] },
    },
    select: { originalFileKey: true, originalFilename: true, reviewStatus: true },
  });
  if (!document?.originalFileKey) return fail("NOT_FOUND", "PDF not found.", 404);

  await prisma.incidentKnowledgeAudit.create({
    data: {
      plantId: plant.id,
      documentId,
      actorUserId: auth.session.user.id,
      operation: "ORIGINAL_PDF_OPENED",
      changes: { accessType: "ORIGINAL_PDF" },
    },
  });

  const buffer = await StorageService.getObjectBuffer({ key: document.originalFileKey });
  const fileName = (document.originalFilename ?? "incident.pdf").replace(/[\r\n"\\/]/g, "_");

  return new NextResponse(buffer, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "content-type": "application/pdf",
      "x-content-type-options": "nosniff",
    },
  });
}
