import { describe, expect, it } from "vitest";
import { CommunicationStatus } from "@prisma/client";
import { calculateLeaveFields, canCloseAction, isKpiEligibleStatus, nextStatusAfterValidation } from "@/lib/services/workflow";

describe("workflow", () => {
  it("calculates leave classification <=30", () => {
    const result = calculateLeaveFields({
      eventDatetime: new Date("2026-01-01T00:00:00.000Z"),
      hasLeave: true,
      returnDate: new Date("2026-01-10T00:00:00.000Z"),
    });

    expect(result.lostDays).toBe(9);
    expect(result.classification).toBe("LE_30");
  });

  it("calculates leave classification >30", () => {
    const result = calculateLeaveFields({
      eventDatetime: new Date("2026-01-01T00:00:00.000Z"),
      hasLeave: true,
      returnDate: new Date("2026-02-15T00:00:00.000Z"),
    });

    expect(result.classification).toBe("GT_30");
  });

  it("validates status transitions", () => {
    expect(nextStatusAfterValidation({ isValid: true, preferredStatus: CommunicationStatus.REJECTED })).toBe(
      CommunicationStatus.VALID_OPEN,
    );
    expect(nextStatusAfterValidation({ isValid: false, preferredStatus: CommunicationStatus.INVALID })).toBe(
      CommunicationStatus.INVALID,
    );
    expect(nextStatusAfterValidation({ isValid: false })).toBe(CommunicationStatus.REJECTED);
  });

  it("filters KPI statuses", () => {
    expect(isKpiEligibleStatus(CommunicationStatus.VALID_OPEN)).toBe(true);
    expect(isKpiEligibleStatus(CommunicationStatus.ONGOING)).toBe(true);
    expect(isKpiEligibleStatus(CommunicationStatus.CLOSED)).toBe(true);
    expect(isKpiEligibleStatus(CommunicationStatus.SUBMITTED)).toBe(false);
  });

  it("requires evidence + comment to close action", () => {
    expect(canCloseAction({ closureComment: "done", evidenceCount: 1 })).toBe(true);
    expect(canCloseAction({ closureComment: "", evidenceCount: 1 })).toBe(false);
    expect(canCloseAction({ closureComment: "done", evidenceCount: 0 })).toBe(false);
  });
});