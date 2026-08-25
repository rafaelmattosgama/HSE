import { FireChecklistFrequency, FireComplianceCellState, FireEquipmentStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  computeFireCompliancePeriodicity,
  type ComputeFireCompliancePeriodicityInput,
} from "@/lib/services/fire-equipment-state-service";

function baseInput(overrides: Partial<ComputeFireCompliancePeriodicityInput> = {}): ComputeFireCompliancePeriodicityInput {
  return {
    now: new Date("2026-08-01T12:00:00.000Z"),
    equipmentStatus: FireEquipmentStatus.ACTIVE,
    frequency: FireChecklistFrequency.QUARTERLY,
    lastExecutionAt: null,
    lastExecutionId: null,
    warningWindowDays: 15,
    ...overrides,
  };
}

describe("computeFireCompliancePeriodicity — step 1 (equipment status)", () => {
  it.each([FireEquipmentStatus.OUT_OF_SERVICE, FireEquipmentStatus.DECOMMISSIONED])(
    "returns NOT_APPLICABLE when equipment status is %s, regardless of execution history",
    (status) => {
      const result = computeFireCompliancePeriodicity(
        baseInput({ equipmentStatus: status, lastExecutionAt: new Date("2026-04-10T12:00:00.000Z"), lastExecutionId: "e1" }),
      );
      expect(result.state).toBe(FireComplianceCellState.NOT_APPLICABLE);
      expect(result.dueDate).toBeNull();
      expect(result.lastExecutionId).toBeNull();
    },
  );
});

describe("computeFireCompliancePeriodicity — steps 2-3 (never done)", () => {
  it.each([FireChecklistFrequency.QUARTERLY, FireChecklistFrequency.ANNUAL])(
    "returns NEVER_DONE for %s when there is no execution yet",
    (frequency) => {
      const result = computeFireCompliancePeriodicity(baseInput({ frequency, lastExecutionAt: null, lastExecutionId: null }));
      expect(result.state).toBe(FireComplianceCellState.NEVER_DONE);
      expect(result.dueDate).toBeNull();
    },
  );
});

describe("computeFireCompliancePeriodicity — step 5 (overdue)", () => {
  it("returns OVERDUE once the quarterly due date (3 months after the last execution) has passed", () => {
    const result = computeFireCompliancePeriodicity(
      baseInput({
        now: new Date("2026-08-01T12:00:00.000Z"),
        frequency: FireChecklistFrequency.QUARTERLY,
        lastExecutionAt: new Date("2026-04-10T12:00:00.000Z"),
        lastExecutionId: "e1",
      }),
    );
    expect(result.state).toBe(FireComplianceCellState.OVERDUE);
    expect(result.dueDate?.toISOString()).toBe("2026-07-10T12:00:00.000Z");
  });

  it("returns OVERDUE once the annual due date (12 months after the last execution) has passed", () => {
    const result = computeFireCompliancePeriodicity(
      baseInput({
        now: new Date("2026-08-01T12:00:00.000Z"),
        frequency: FireChecklistFrequency.ANNUAL,
        lastExecutionAt: new Date("2025-06-01T12:00:00.000Z"),
        lastExecutionId: "e1",
        warningWindowDays: 45,
      }),
    );
    expect(result.state).toBe(FireComplianceCellState.OVERDUE);
  });
});

describe("computeFireCompliancePeriodicity — steps 6-7 (warning threshold boundaries)", () => {
  // due = 2026-07-10T12:00:00Z (lastExecutionAt + 3 months), warningWindowDays = 15.
  // §6's own note: proportional to the cycle (~17%), never the Competences
  // module's 90-day literal, which would leave this 90-day cycle permanently amber.
  it("QUARTERLY: 14 days before due is DUE_SOON (inside the 15-day window)", () => {
    const result = computeFireCompliancePeriodicity(
      baseInput({
        now: new Date("2026-06-26T12:00:00.000Z"),
        lastExecutionAt: new Date("2026-04-10T12:00:00.000Z"),
        lastExecutionId: "e1",
        warningWindowDays: 15,
      }),
    );
    expect(result.state).toBe(FireComplianceCellState.DUE_SOON);
  });

  it("QUARTERLY: 15 days before due is DUE_SOON (exactly at the window)", () => {
    const result = computeFireCompliancePeriodicity(
      baseInput({
        now: new Date("2026-06-25T12:00:00.000Z"),
        lastExecutionAt: new Date("2026-04-10T12:00:00.000Z"),
        lastExecutionId: "e1",
        warningWindowDays: 15,
      }),
    );
    expect(result.state).toBe(FireComplianceCellState.DUE_SOON);
  });

  it("QUARTERLY: 16 days before due is VALID (just outside the 15-day window)", () => {
    const result = computeFireCompliancePeriodicity(
      baseInput({
        now: new Date("2026-06-24T12:00:00.000Z"),
        lastExecutionAt: new Date("2026-04-10T12:00:00.000Z"),
        lastExecutionId: "e1",
        warningWindowDays: 15,
      }),
    );
    expect(result.state).toBe(FireComplianceCellState.VALID);
  });

  // due = 2026-07-10T12:00:00Z (lastExecutionAt + 12 months), warningWindowDays = 45.
  it("ANNUAL: 44 days before due is DUE_SOON (inside the 45-day window)", () => {
    const result = computeFireCompliancePeriodicity(
      baseInput({
        now: new Date("2026-05-27T12:00:00.000Z"),
        frequency: FireChecklistFrequency.ANNUAL,
        lastExecutionAt: new Date("2025-07-10T12:00:00.000Z"),
        lastExecutionId: "e1",
        warningWindowDays: 45,
      }),
    );
    expect(result.state).toBe(FireComplianceCellState.DUE_SOON);
  });

  it("ANNUAL: 45 days before due is DUE_SOON (exactly at the window)", () => {
    const result = computeFireCompliancePeriodicity(
      baseInput({
        now: new Date("2026-05-26T12:00:00.000Z"),
        frequency: FireChecklistFrequency.ANNUAL,
        lastExecutionAt: new Date("2025-07-10T12:00:00.000Z"),
        lastExecutionId: "e1",
        warningWindowDays: 45,
      }),
    );
    expect(result.state).toBe(FireComplianceCellState.DUE_SOON);
  });

  it("ANNUAL: 46 days before due is VALID (just outside the 45-day window)", () => {
    const result = computeFireCompliancePeriodicity(
      baseInput({
        now: new Date("2026-05-25T12:00:00.000Z"),
        frequency: FireChecklistFrequency.ANNUAL,
        lastExecutionAt: new Date("2025-07-10T12:00:00.000Z"),
        lastExecutionId: "e1",
        warningWindowDays: 45,
      }),
    );
    expect(result.state).toBe(FireComplianceCellState.VALID);
  });
});

describe("computeFireCompliancePeriodicity — Europe/Lisbon DST transitions", () => {
  // §6: "toZonedTime para Europe/Lisbon e differenceInCalendarDays — nunca
  // diferença em milissegundos, que erra em um dia nas mudanças de hora de
  // março e outubro." lastExecutionAt below is chosen (and verified) so the
  // computed due date lands on 2026-03-29T23:00:00.000Z — i.e. local
  // 2026-03-30T00:00 WEST, the day right after Portugal's spring-forward
  // transition (2026-03-29, 01:00 WET -> 02:00 WEST). A naive
  // (due.getTime() - now.getTime()) / 86400000 would read 1 full day short
  // here (the 29th only has 23 real hours), misclassifying the 16-day case
  // below as DUE_SOON instead of VALID.
  describe("March spring-forward (2026-03-29)", () => {
    const lastExecutionAt = new Date("2025-12-30T00:00:00.000Z");

    it("14 days (in Lisbon calendar terms) before a due date just after the transition is DUE_SOON", () => {
      const result = computeFireCompliancePeriodicity(
        baseInput({ now: new Date("2026-03-16T00:00:00.000Z"), lastExecutionAt, lastExecutionId: "e1", warningWindowDays: 15 }),
      );
      expect(result.dueDate?.toISOString()).toBe("2026-03-29T23:00:00.000Z");
      expect(result.state).toBe(FireComplianceCellState.DUE_SOON);
    });

    it("15 days before is still DUE_SOON", () => {
      const result = computeFireCompliancePeriodicity(
        baseInput({ now: new Date("2026-03-15T00:00:00.000Z"), lastExecutionAt, lastExecutionId: "e1", warningWindowDays: 15 }),
      );
      expect(result.state).toBe(FireComplianceCellState.DUE_SOON);
    });

    it("16 days before is VALID — a millisecond-based diff would wrongly say DUE_SOON here", () => {
      const result = computeFireCompliancePeriodicity(
        baseInput({ now: new Date("2026-03-14T00:00:00.000Z"), lastExecutionAt, lastExecutionId: "e1", warningWindowDays: 15 }),
      );
      expect(result.state).toBe(FireComplianceCellState.VALID);
    });
  });

  // lastExecutionAt below is chosen (and verified) so the computed due date
  // lands on 2026-10-26T01:00:00.000Z — local 2026-10-26T01:00 WET, right
  // after Portugal's fall-back transition (2026-10-25, 02:00 WEST -> 01:00
  // WET). The October day gains an hour instead of losing one; covered here
  // for the same §6 requirement even though it doesn't produce the same
  // direction of error as the March case above.
  describe("October fall-back (2026-10-25)", () => {
    const lastExecutionAt = new Date("2025-10-26T00:00:00.000Z");

    it("44 days before the due date is DUE_SOON", () => {
      const result = computeFireCompliancePeriodicity(
        baseInput({
          now: new Date("2026-09-12T00:00:00.000Z"),
          frequency: FireChecklistFrequency.ANNUAL,
          lastExecutionAt,
          lastExecutionId: "e1",
          warningWindowDays: 45,
        }),
      );
      expect(result.dueDate?.toISOString()).toBe("2026-10-26T01:00:00.000Z");
      expect(result.state).toBe(FireComplianceCellState.DUE_SOON);
    });

    it("45 days before is still DUE_SOON", () => {
      const result = computeFireCompliancePeriodicity(
        baseInput({
          now: new Date("2026-09-11T00:00:00.000Z"),
          frequency: FireChecklistFrequency.ANNUAL,
          lastExecutionAt,
          lastExecutionId: "e1",
          warningWindowDays: 45,
        }),
      );
      expect(result.state).toBe(FireComplianceCellState.DUE_SOON);
    });

    it("46 days before is VALID", () => {
      const result = computeFireCompliancePeriodicity(
        baseInput({
          now: new Date("2026-09-10T00:00:00.000Z"),
          frequency: FireChecklistFrequency.ANNUAL,
          lastExecutionAt,
          lastExecutionId: "e1",
          warningWindowDays: 45,
        }),
      );
      expect(result.state).toBe(FireComplianceCellState.VALID);
    });
  });
});

describe("computeFireCompliancePeriodicity — the two periodicities are independent axes", () => {
  it("the same equipment can be VALID quarterly and OVERDUE annually at the same time", () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    const quarterly = computeFireCompliancePeriodicity(
      baseInput({ now, frequency: FireChecklistFrequency.QUARTERLY, lastExecutionAt: new Date("2026-07-20T12:00:00.000Z"), lastExecutionId: "q1", warningWindowDays: 15 }),
    );
    const annual = computeFireCompliancePeriodicity(
      baseInput({ now, frequency: FireChecklistFrequency.ANNUAL, lastExecutionAt: new Date("2025-01-01T12:00:00.000Z"), lastExecutionId: "a1", warningWindowDays: 45 }),
    );
    expect(quarterly.state).toBe(FireComplianceCellState.VALID);
    expect(annual.state).toBe(FireComplianceCellState.OVERDUE);
  });
});
