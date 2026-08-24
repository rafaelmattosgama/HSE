import { CommunicationType } from "@prisma/client";

export const COMMUNICATION_PDF_REPORT_TYPES: CommunicationType[] = [
  CommunicationType.UNSAFE_ACT,
  CommunicationType.UNSAFE_CONDITION,
  CommunicationType.NEAR_MISS,
  CommunicationType.FIRST_AID,
  CommunicationType.ACCIDENT,
  CommunicationType.FIVE_S_IMPROVEMENT,
  CommunicationType.IMPROVEMENT_SUGGESTION,
];

export function supportsCommunicationPdfReport(type: CommunicationType | string | null | undefined) {
  return COMMUNICATION_PDF_REPORT_TYPES.includes(type as CommunicationType);
}

export function sanitizeCommunicationPdfFileName(reference: string) {
  const safeReference = reference
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^A-Za-z0-9._-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

  return `comunicacao-seguranca-${safeReference || "sem-referencia"}.pdf`;
}
