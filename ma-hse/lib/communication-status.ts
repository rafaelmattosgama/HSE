import { ActionStatus, CommunicationStatus } from "@prisma/client";

export const OPEN_LINKED_ACTION_STATUSES = [ActionStatus.OPEN, ActionStatus.ONGOING] as const;

export function isOpenLinkedActionStatus(status: ActionStatus | string | null | undefined) {
  return Boolean(status && OPEN_LINKED_ACTION_STATUSES.includes(status as (typeof OPEN_LINKED_ACTION_STATUSES)[number]));
}

export function hasOpenLinkedActions(actionStatuses: readonly (ActionStatus | string | null | undefined)[]) {
  return actionStatuses.some((status) => isOpenLinkedActionStatus(status));
}

export function getCommunicationStatusFromLinkedActions(
  actionStatuses: readonly (ActionStatus | string | null | undefined)[],
) {
  return hasOpenLinkedActions(actionStatuses) ? CommunicationStatus.ONGOING : CommunicationStatus.CLOSED;
}
