import { CommunicationStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { formatCommunicationStatus, normalizeCommunicationStatus } from "@/lib/helpers";

describe("communication status presentation", () => {
  it("maps submitted and pending validation to the In validation presentation state", () => {
    expect(normalizeCommunicationStatus(CommunicationStatus.SUBMITTED)).toBe("in_validation");
    expect(normalizeCommunicationStatus(CommunicationStatus.PENDING_VALIDATION)).toBe("in_validation");
    expect(formatCommunicationStatus(CommunicationStatus.SUBMITTED)).toBe("In validation");
    expect(formatCommunicationStatus(CommunicationStatus.PENDING_VALIDATION)).toBe("In validation");
  });

  it("keeps approved lifecycle statuses on their existing presentation states", () => {
    expect(normalizeCommunicationStatus(CommunicationStatus.VALID_OPEN)).toBe("to_do");
    expect(normalizeCommunicationStatus(CommunicationStatus.ONGOING)).toBe("on_going");
    expect(normalizeCommunicationStatus(CommunicationStatus.CLOSED)).toBe("closed");
  });
});
