import { ExternalCompanyApprovalStatus, ExternalCompanyDocumentType, ExternalWorkerDocumentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const REQUIRED_COMPANY_DOCUMENTS: ExternalCompanyDocumentType[] = [
  "ANEXO_D",
  "RISK_ASSESSMENT",
  "WORK_ACCIDENT_INSURANCE",
  "CIVIL_LIABILITY_INSURANCE",
  "SOCIAL_SECURITY_CLEARANCE",
  "TAX_AUTHORITY_CLEARANCE",
];

export const REQUIRED_WORKER_DOCUMENTS: ExternalWorkerDocumentType[] = [
  "MEDICAL_FITNESS",
  "PPE_DELIVERY",
  "TRAINING",
];

function minDate(dates: Date[]) {
  return dates.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
}

export const ExternalCompanyService = {
  async recomputeCompanyStatus(companyId: string) {
    const company = await prisma.externalCompany.findUniqueOrThrow({
      where: { id: companyId },
      include: {
        documents: true,
      },
    });

    const requiredDocs = REQUIRED_COMPANY_DOCUMENTS.map((type) => company.documents.find((doc) => doc.type === type)).filter(Boolean);
    const approvedDocs = requiredDocs.filter((doc) => doc?.approvalStatus === ExternalCompanyApprovalStatus.APPROVED) as typeof company.documents;
    const approvedUntilCandidates = approvedDocs.flatMap((doc) => (doc.validUntil ? [doc.validUntil] : []));
    const approvedUntil = approvedUntilCandidates.length ? minDate(approvedUntilCandidates) : null;

    let approvalStatus: ExternalCompanyApprovalStatus = ExternalCompanyApprovalStatus.PENDING;
    if (requiredDocs.some((doc) => !doc || doc.approvalStatus === ExternalCompanyApprovalStatus.REJECTED)) {
      approvalStatus = ExternalCompanyApprovalStatus.REJECTED;
    } else if (requiredDocs.length === REQUIRED_COMPANY_DOCUMENTS.length && approvedDocs.length === REQUIRED_COMPANY_DOCUMENTS.length) {
      approvalStatus = approvedUntil && approvedUntil < new Date() ? ExternalCompanyApprovalStatus.EXPIRED : ExternalCompanyApprovalStatus.APPROVED;
    }

    return prisma.externalCompany.update({
      where: { id: companyId },
      data: {
        approvalStatus,
        approvedUntil,
      },
    });
  },

  async recomputeWorkerStatus(workerId: string) {
    const worker = await prisma.externalWorker.findUniqueOrThrow({
      where: { id: workerId },
      include: {
        documents: true,
        company: true,
      },
    });

    const medical = worker.documents.find((doc) => doc.type === ExternalWorkerDocumentType.MEDICAL_FITNESS);
    const allRequiredPresent = REQUIRED_WORKER_DOCUMENTS.every((type) => worker.documents.some((doc) => doc.type === type));
    const anyRejected = worker.documents.some((doc) => doc.approvalStatus === ExternalCompanyApprovalStatus.REJECTED);

    let approvedUntil: Date | null = null;
    if (worker.company.approvedUntil && medical?.validUntil) {
      approvedUntil = minDate([worker.company.approvedUntil, medical.validUntil]);
    }

    let approvalStatus: ExternalCompanyApprovalStatus = ExternalCompanyApprovalStatus.PENDING;
    if (anyRejected) {
      approvalStatus = ExternalCompanyApprovalStatus.REJECTED;
    } else if (allRequiredPresent && worker.documents.every((doc) => doc.approvalStatus === ExternalCompanyApprovalStatus.APPROVED)) {
      approvalStatus = approvedUntil && approvedUntil < new Date() ? ExternalCompanyApprovalStatus.EXPIRED : ExternalCompanyApprovalStatus.APPROVED;
    }

    return prisma.externalWorker.update({
      where: { id: workerId },
      data: {
        approvalStatus,
        approvedUntil,
      },
    });
  },
};
