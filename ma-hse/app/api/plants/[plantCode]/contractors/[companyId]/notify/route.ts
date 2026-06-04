import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/prisma";
import { REQUIRED_COMPANY_DOCUMENTS, REQUIRED_WORKER_DOCUMENTS } from "@/lib/services/external-company-service";
import { sendContractorDocumentationFollowupEmail } from "@/src/email/systemEmailHelpers.js";

export async function POST(_request: Request, context: { params: Promise<{ plantCode: string; companyId: string }> }) {
  const { plantCode, companyId } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N3_SAFETY, RoleCode.N1_CORPORATE]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const company = await prisma.externalCompany.findFirstOrThrow({
    where: { id: companyId, plantId: plant.id },
    include: {
      documents: true,
      workers: {
        include: {
          documents: true,
        },
      },
    },
  });

  const missingCompanyDocuments = REQUIRED_COMPANY_DOCUMENTS.filter(
    (type) => !company.documents.some((document) => document.type === type),
  );
  const rejectedCompanyDocuments = company.documents
    .filter((document) => document.approvalStatus === "REJECTED")
    .map((document) => document.type);

  const workerIssues = company.workers.flatMap((worker) => {
    const missing = REQUIRED_WORKER_DOCUMENTS.filter((type) => !worker.documents.some((document) => document.type === type));
    const rejected = worker.documents
      .filter((document) => document.approvalStatus === "REJECTED")
      .map((document) => document.type);
    if (!missing.length && !rejected.length) return [];
    return [
      `${worker.name}: ${
        [
          missing.length ? `missing ${missing.join(", ")}` : null,
          rejected.length ? `rejected ${rejected.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join(" | ")
      }`,
    ];
  });

  const bulletLines = [
    ...missingCompanyDocuments.map((document) => `Company document missing: ${document}`),
    ...rejectedCompanyDocuments.map((document) => `Company document rejected: ${document}`),
    ...workerIssues.map((issue) => `Worker issue: ${issue}`),
  ];

  await sendContractorDocumentationFollowupEmail({
    to: company.email,
    user: {
      name: company.contactName,
      email: company.email,
    },
    plantName: plant.name,
    mensagem: [
      `Hello ${company.contactName},`,
      `Please review the current documentation status for ${company.companyName}.`,
      ...(bulletLines.length ? bulletLines : ["All required documents are currently approved."]),
      "Access the platform to upload the missing or corrected files.",
    ].join("\n"),
  });

  return ok({ sent: true, issues: bulletLines.length });
}
