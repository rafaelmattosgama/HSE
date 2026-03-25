import { describe, expect, it } from "vitest";
import { CommunicationType } from "@prisma/client";
import { CommunicationService } from "@/lib/services/communication-service";
import { createCommunicationInput } from "@/lib/validation/dtos";

describe("token-based communication rules", () => {
  it("allows only N6 communication types", () => {
    expect(CommunicationService.isN6AllowedType(CommunicationType.UNSAFE_ACT)).toBe(true);
    expect(CommunicationService.isN6AllowedType(CommunicationType.UNSAFE_CONDITION)).toBe(true);
    expect(CommunicationService.isN6AllowedType(CommunicationType.NEAR_MISS)).toBe(true);
    expect(CommunicationService.isN6AllowedType(CommunicationType.ACCIDENT)).toBe(false);
  });

  it("validates required payload shape", () => {
    const parsed = createCommunicationInput.parse({
      type: CommunicationType.UNSAFE_CONDITION,
      eventDatetime: new Date().toISOString(),
      reporterName: "N6 Reporter",
      riskThemeId: "7b2e2f06-8fd2-4ec1-98f2-a60d6cdeab34",
      description: "Unsafe condition reported from QR",
    });

    expect(parsed.type).toBe(CommunicationType.UNSAFE_CONDITION);
  });
});
