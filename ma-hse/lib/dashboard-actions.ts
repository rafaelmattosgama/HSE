const OPEN_ACTION_STATUSES = new Set(["OPEN", "ONGOING"]);

type DashboardActionStatus = string | null | undefined;

type LinkedActionStatus = {
  status: DashboardActionStatus;
};

export type DashboardActionLike = {
  status: DashboardActionStatus;
  dueDate?: Date | null;
};

export function getStartOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function isDashboardOpenAction(action: { status: DashboardActionStatus }) {
  return OPEN_ACTION_STATUSES.has(action.status ?? "");
}

export function isDashboardOverdueAction(action: DashboardActionLike, referenceDate = new Date()) {
  if (!isDashboardOpenAction(action) || !(action.dueDate instanceof Date)) {
    return false;
  }

  const dueTime = action.dueDate.getTime();

  if (!Number.isFinite(dueTime)) {
    return false;
  }

  return dueTime < getStartOfLocalDay(referenceDate).getTime();
}

/**
 * Calculates the completion rate for communication records that have at least
 * one linked follow-up action. A record is complete only when every linked
 * action is closed; records without an action are not applicable and are
 * therefore excluded from the denominator.
 */
export function getLinkedCommunicationClosureRate(
  communications: Array<{ actions: readonly LinkedActionStatus[] }>,
) {
  const applicableCommunications = communications.filter((communication) => communication.actions.length > 0);

  if (applicableCommunications.length === 0) return null;

  const closedCommunications = applicableCommunications.filter((communication) =>
    communication.actions.every((action) => action.status === "CLOSED"),
  ).length;

  return (closedCommunications / applicableCommunications.length) * 100;
}
