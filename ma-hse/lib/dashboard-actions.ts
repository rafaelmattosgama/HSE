const OPEN_ACTION_STATUSES = new Set(["OPEN", "ONGOING"]);

type DashboardActionStatus = string | null | undefined;

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
