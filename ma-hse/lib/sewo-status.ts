import { SEWOStatus, type ActionStatus } from "@prisma/client";
import { hasOpenLinkedActions } from "@/lib/communication-status";

export function getSewoStatusFromLinkedActions(
  actionStatuses: readonly (ActionStatus | string | null | undefined)[],
  options: { approved: boolean },
) {
  if (!actionStatuses.length) {
    return null;
  }

  if (!hasOpenLinkedActions(actionStatuses)) {
    return SEWOStatus.CLOSED;
  }

  return options.approved ? SEWOStatus.APPROVED : SEWOStatus.DRAFT;
}

export function getNextSewoSubmissionStatus(currentStatus?: SEWOStatus | string | null) {
  if (!currentStatus || currentStatus === SEWOStatus.DRAFT || currentStatus === SEWOStatus.REJECTED) {
    return SEWOStatus.IN_APPROVAL;
  }

  return currentStatus as SEWOStatus;
}
