import { ExternalCompanyApprovalStatus, RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { getContractorSessionCompany } from "@/lib/contractor-auth";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { NotificationService } from "@/lib/services/notification-service";
import { ExternalCompanyService } from "@/lib/services/external-company-service";
import { contractorWorkerDocumentInput } from "@/lib/validation/dtos";

export async function POST(request: Request) {
  const company = await getContractorSessionCompany();
  if (!company) {
    return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), { status: 401 });
  }

  const parsed = await parseBody(request, contractorWorkerDocumentInput);
  if ("error" in parsed) return parsed.error;

  const worker = await prisma.externalWorker.findFirstOrThrow({
    where: {
      id: parsed.data.workerId,
      companyId: company.id,
    },
  });

  const document = await prisma.externalWorkerDocument.upsert({
    where: {
      workerId_type: {
        workerId: worker.id,
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
      workerId: worker.id,
      type: parsed.data.type,
      fileKey: parsed.data.fileKey,
      fileName: parsed.data.fileName,
      contentType: parsed.data.contentType,
      validUntil: parsed.data.validUntil,
      approvalStatus: ExternalCompanyApprovalStatus.PENDING,
    },
  });

  await ExternalCompanyService.recomputeWorkerStatus(worker.id);
  await NotificationService.notifyPlantRoles({
    plantId: company.plantId,
    roles: [RoleCode.N3_SAFETY],
    title: "External worker documents pending approval",
    body: `${worker.name} submitted ${parsed.data.type} and is pending approval.`,
  });

  return ok(document, { status: 201 });
}
