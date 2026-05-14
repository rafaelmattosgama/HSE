import { CommunicationStatus, LeaveClassification, RoleCode } from "@prisma/client";
import { daysBetween } from "@/lib/utils";

export function calculateLeaveFields(input: {
  eventDatetime: Date;
  lostDays?: number | null;
  hasLeave?: boolean | null;
  returnDate?: Date | null;
  isFatal?: boolean | null;
}) {
  if (input.isFatal) {
    return {
      lostDays: input.lostDays ?? null,
      classification: LeaveClassification.FATAL,
    };
  }

  const explicitLostDays = typeof input.lostDays === "number" ? Math.max(0, input.lostDays) : null;
  const calculatedLostDays = input.hasLeave && input.returnDate ? daysBetween(input.eventDatetime, input.returnDate) : null;
  const lostDays = explicitLostDays ?? calculatedLostDays;

  if (lostDays === null) {
    return {
      lostDays: null,
      classification: null,
    };
  }

  return {
    lostDays,
    classification: lostDays < 30 ? LeaveClassification.MINOR : LeaveClassification.SERIOUS,
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

export function initialStatusForCommunicationCreation(actorRole?: RoleCode | null) {
  if (actorRole === RoleCode.N3_SAFETY) {
    return CommunicationStatus.VALID_OPEN;
  }

  return CommunicationStatus.SUBMITTED;
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
  return Boolean(input.closureComment?.trim().length);
}
