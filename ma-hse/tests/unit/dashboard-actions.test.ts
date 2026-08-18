import { describe, expect, it } from "vitest";
import { getLinkedCommunicationClosureRate, isDashboardOpenAction, isDashboardOverdueAction } from "@/lib/dashboard-actions";

const referenceDate = new Date(2026, 5, 5, 13, 30);

describe("dashboard action metrics", () => {
  it("does not count an open action that is still within the deadline as overdue", () => {
    expect(isDashboardOverdueAction({ status: "OPEN", dueDate: new Date(2026, 5, 6, 9, 0) }, referenceDate)).toBe(false);
  });

  it("counts an open action with an expired deadline as overdue", () => {
    expect(isDashboardOverdueAction({ status: "OPEN", dueDate: new Date(2026, 5, 4, 23, 59) }, referenceDate)).toBe(true);
  });

  it("does not count a closed action with an expired deadline as overdue", () => {
    expect(isDashboardOverdueAction({ status: "CLOSED", dueDate: new Date(2026, 5, 4, 23, 59) }, referenceDate)).toBe(false);
  });

  it("does not count an open action without a due date as overdue", () => {
    expect(isDashboardOverdueAction({ status: "OPEN", dueDate: null }, referenceDate)).toBe(false);
  });

  it("does not count an action due today as overdue", () => {
    expect(isDashboardOverdueAction({ status: "ONGOING", dueDate: new Date(2026, 5, 5, 0, 0) }, referenceDate)).toBe(false);
  });

  it("keeps open action totals separate from overdue action totals", () => {
    const actions = [
      { status: "OPEN", dueDate: new Date(2026, 5, 4, 12, 0) },
      { status: "OPEN", dueDate: new Date(2026, 5, 6, 12, 0) },
      { status: "ONGOING", dueDate: new Date(2026, 5, 5, 12, 0) },
      { status: "CLOSED", dueDate: new Date(2026, 5, 4, 12, 0) },
      { status: "OPEN", dueDate: null },
    ];

    expect(actions.filter(isDashboardOpenAction)).toHaveLength(4);
    expect(actions.filter((action) => isDashboardOverdueAction(action, referenceDate))).toHaveLength(1);
  });

  it("calculates a linked-communication closure rate from applicable records only", () => {
    expect(getLinkedCommunicationClosureRate([
      { actions: [{ status: "CLOSED" }] },
      { actions: [{ status: "CLOSED" }, { status: "CLOSED" }] },
      { actions: [{ status: "ONGOING" }] },
      { actions: [] },
    ])).toBeCloseTo((2 / 3) * 100);
  });

  it("returns not-applicable when no communication has a linked action", () => {
    expect(getLinkedCommunicationClosureRate([{ actions: [] }, { actions: [] }])).toBeNull();
  });
});
