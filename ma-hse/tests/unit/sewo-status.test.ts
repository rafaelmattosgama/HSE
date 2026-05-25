import { ActionStatus, SEWOStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { getNextSewoSubmissionStatus, getSewoStatusFromLinkedActions } from "@/lib/sewo-status";

describe("sewo status synchronization helpers", () => {
  it("keeps approved S-EWO records approved while linked actions remain open", () => {
    expect(
      getSewoStatusFromLinkedActions([ActionStatus.OPEN, ActionStatus.CLOSED], { approved: true }),
    ).toBe(SEWOStatus.APPROVED);
  });

  it("reopens non-approved S-EWO records as draft while linked actions remain open", () => {
    expect(
      getSewoStatusFromLinkedActions([ActionStatus.ONGOING], { approved: false }),
    ).toBe(SEWOStatus.DRAFT);
  });

  it("closes the S-EWO when all linked actions are closed", () => {
    expect(
      getSewoStatusFromLinkedActions([ActionStatus.CLOSED, ActionStatus.CLOSED], { approved: true }),
    ).toBe(SEWOStatus.CLOSED);
  });

  it("does not force a status change when there are no linked actions", () => {
    expect(getSewoStatusFromLinkedActions([], { approved: true })).toBeNull();
  });

  it("resubmits rejected S-EWO records back into N1 approval", () => {
    expect(getNextSewoSubmissionStatus(SEWOStatus.REJECTED)).toBe(SEWOStatus.IN_APPROVAL);
    expect(getNextSewoSubmissionStatus(SEWOStatus.DRAFT)).toBe(SEWOStatus.IN_APPROVAL);
    expect(getNextSewoSubmissionStatus(SEWOStatus.APPROVED)).toBe(SEWOStatus.APPROVED);
  });
});
