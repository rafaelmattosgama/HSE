import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/prisma";
import { EmailService } from "@/lib/services/email-service";
import { REQUIRED_COMPANY_DOCUMENTS, REQUIRED_WORKER_DOCUMENTS } from "@/lib/services/external-company-service";

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

  const htmlList = bulletLines.length
    ? `<ul>${bulletLines.map((line) => `<li>${line}</li>`).join("")}</ul>`
    : "<p>All required documents are currently approved.</p>";

  await EmailService.sendMail({
    to: company.email,
    subject: `${plant.name} - contractor documentation follow-up`,
    html: `<p>Hello ${company.contactName},</p><p>Please review the current documentation status for ${company.companyName}.</p>${htmlList}<p>Access the platform to upload the missing or corrected files.</p>`,
    text: [
      `Hello ${company.contactName},`,
      "",
      `Please review the current documentation status for ${company.companyName}.`,
      ...bulletLines,
      "",
      "Access the platform to upload the missing or corrected files.",
    ].join("\n"),
  });

  return ok({ sent: true, issues: bulletLines.length });
}
