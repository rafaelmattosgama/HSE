import { ActionStatus, CommunicationStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  getCommunicationStatusFromLinkedActions,
  hasOpenLinkedActions,
  isOpenLinkedActionStatus,
  OPEN_LINKED_ACTION_STATUSES,
} from "@/lib/communication-status";

describe("communication status synchronization helpers", () => {
  it("identifies open linked action statuses", () => {
    expect(OPEN_LINKED_ACTION_STATUSES).toEqual([ActionStatus.OPEN, ActionStatus.ONGOING]);
    expect(isOpenLinkedActionStatus(ActionStatus.OPEN)).toBe(true);
    expect(isOpenLinkedActionStatus(ActionStatus.ONGOING)).toBe(true);
    expect(isOpenLinkedActionStatus(ActionStatus.CLOSED)).toBe(false);
  });

  it("detects when a communication still has linked actions in progress", () => {
    expect(hasOpenLinkedActions([ActionStatus.CLOSED, ActionStatus.OPEN])).toBe(true);
    expect(hasOpenLinkedActions([ActionStatus.CLOSED, ActionStatus.ONGOING])).toBe(true);
    expect(hasOpenLinkedActions([ActionStatus.CLOSED, ActionStatus.CLOSED])).toBe(false);
  });

  it("maps linked action statuses to the correct communication status", () => {
    expect(getCommunicationStatusFromLinkedActions([ActionStatus.OPEN])).toBe(CommunicationStatus.ONGOING);
    expect(getCommunicationStatusFromLinkedActions([ActionStatus.ONGOING, ActionStatus.CLOSED])).toBe(CommunicationStatus.ONGOING);
    expect(getCommunicationStatusFromLinkedActions([ActionStatus.CLOSED, ActionStatus.CLOSED])).toBe(CommunicationStatus.CLOSED);
  });
});
