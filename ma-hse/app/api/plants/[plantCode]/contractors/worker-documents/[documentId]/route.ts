import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/prisma";
import { ExternalCompanyService } from "@/lib/services/external-company-service";
import { contractorApprovalInput } from "@/lib/validation/dtos";

export async function PATCH(request: Request, context: { params: Promise<{ plantCode: string; documentId: string }> }) {
  const { plantCode, documentId } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N3_SAFETY, RoleCode.N1_CORPORATE]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, contractorApprovalInput);
  if ("error" in parsed) return parsed.error;

  const document = await prisma.externalWorkerDocument.update({
    where: { id: documentId },
    data: {
      approvalStatus: parsed.data.approvalStatus,
      approvalComment: parsed.data.approvalComment,
      reviewedByUserId: auth.session.user.id,
      reviewedAt: new Date(),
    },
  });

  await ExternalCompanyService.recomputeWorkerStatus(document.workerId);
  return ok(document);
}
