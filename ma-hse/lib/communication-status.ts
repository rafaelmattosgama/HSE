import { ActionStatus, CommunicationStatus } from "@prisma/client";

export const OPEN_LINKED_ACTION_STATUSES = [ActionStatus.OPEN, ActionStatus.ONGOING] as const;
export const COMMUNICATION_IN_VALIDATION_STATUSES = [
  CommunicationStatus.SUBMITTED,
  CommunicationStatus.PENDING_VALIDATION,
] as const;
export const LINKABLE_COMMUNICATION_STATUSES = [
  CommunicationStatus.VALID_OPEN,
  CommunicationStatus.ONGOING,
  CommunicationStatus.CLOSED,
] as const;

export function isCommunicationInValidationStatus(status: CommunicationStatus | string | null | undefined) {
  return Boolean(status && COMMUNICATION_IN_VALIDATION_STATUSES.includes(status as (typeof COMMUNICATION_IN_VALIDATION_STATUSES)[number]));
}

export function isCommunicationLinkableStatus(status: CommunicationStatus | string | null | undefined) {
  return Boolean(status && LINKABLE_COMMUNICATION_STATUSES.includes(status as (typeof LINKABLE_COMMUNICATION_STATUSES)[number]));
}

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
