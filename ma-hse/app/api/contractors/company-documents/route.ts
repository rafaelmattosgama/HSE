import { ExternalCompanyApprovalStatus, RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { getContractorSessionCompany } from "@/lib/contractor-auth";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { NotificationService } from "@/lib/services/notification-service";
import { ExternalCompanyService } from "@/lib/services/external-company-service";
import { contractorCompanyDocumentInput } from "@/lib/validation/dtos";

export async function POST(request: Request) {
  const company = await getContractorSessionCompany();
  if (!company) {
    return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401 });
  }

  const parsed = await parseBody(request, contractorCompanyDocumentInput);
  if ("error" in parsed) return parsed.error;

  const document = await prisma.externalCompanyDocument.upsert({
    where: {
      companyId_type: {
        companyId: company.id,
        type: parsed.data.type,
      },
    },
    update: {
      fileKey: parsed.data.fileKey,
      fileName: parsed.data.fileName,
      contentType: parsed.data.contentType,
      validUntil: parsed.data.validUntil,
      approvalStatus: ExternalCompanyApprovalStatus.PENDING,
      approvalComment: null,
      reviewedByUserId: null,
      reviewedAt: null,
    },
    create: {
      companyId: company.id,
      type: parsed.data.type,
      fileKey: parsed.data.fileKey,
      fileName: parsed.data.fileName,
      contentType: parsed.data.contentType,
      validUntil: parsed.data.validUntil,
      approvalStatus: ExternalCompanyApprovalStatus.PENDING,
    },
  });

  await ExternalCompanyService.recomputeCompanyStatus(company.id);
  await NotificationService.notifyPlantRoles({
    plantId: company.plantId,
    roles: [RoleCode.N3_SAFETY],
    title: "External company documents pending approval",
    body: `${company.companyName} submitted ${parsed.data.type} and is pending approval.`,
  });

  return ok(document, { status: 201 });
}
