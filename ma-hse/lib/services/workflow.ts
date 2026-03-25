import { CommunicationStatus, LeaveClassification } from "@prisma/client";
import { daysBetween } from "@/lib/utils";

export function calculateLeaveFields(input: {
  eventDatetime: Date;
  hasLeave?: boolean | null;
  returnDate?: Date | null;
}) {
  if (!input.hasLeave || !input.returnDate) {
    return {
      lostDays: null,
      classification: null,
    };
  }

  const lostDays = daysBetween(input.eventDatetime, input.returnDate);

  return {
    lostDays,
    classification: lostDays <= 30 ? LeaveClassification.LE_30 : LeaveClassification.GT_30,
  };
}

export function nextStatusAfterValidation(input: {
  isValid: boolean;
  preferredStatus?: CommunicationStatus | "VALID_OPEN" | "REJECTED" | "INVALID";
}) {
  if (input.isValid) {
    return CommunicationStatus.VALID_OPEN;
  }

  return input.preferredStatus === CommunicationStatus.INVALID
    ? CommunicationStatus.INVALID
    : CommunicationStatus.REJECTED;
}

export function isKpiEligibleStatus(status: CommunicationStatus) {
  const eligible: CommunicationStatus[] = [
    CommunicationStatus.VALID_OPEN,
    CommunicationStatus.ONGOING,
    CommunicationStatus.CLOSED,
  ];
  return eligible.includes(status);
}

export function canCloseAction(input: {
  closureComment?: string | null;
  evidenceCount: number;
}) {
  return Boolean(input.closureComment?.trim().length) && input.evidenceCount > 0;
}
