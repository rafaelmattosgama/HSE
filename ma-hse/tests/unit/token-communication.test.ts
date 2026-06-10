import { describe, expect, it } from "vitest";
import { CommunicationType } from "@prisma/client";
import { shouldDeferPublicReportUnsafeActType } from "@/lib/communication-classification";
import { CommunicationService } from "@/lib/services/communication-service";
import { createCommunicationInput, createPublicReportCommunicationInput } from "@/lib/validation/dtos";

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
      reporterName: "QR Reporter",
      description: "Unsafe condition reported from QR",
    });

    expect(parsed.type).toBe(CommunicationType.UNSAFE_CONDITION);
  });

  it("rejects reporter names with numeric characters", () => {
    const parsed = createCommunicationInput.safeParse({
      type: CommunicationType.UNSAFE_CONDITION,
      eventDatetime: new Date().toISOString(),
      reporterName: "Reporter 123",
      description: "Unsafe condition reported from QR",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path.includes("reporterName"))).toBe(true);
    }
  });

  it("requires an unsafe act type for unsafe act communications", () => {
    const parsed = createCommunicationInput.safeParse({
      type: CommunicationType.UNSAFE_ACT,
      eventDatetime: new Date().toISOString(),
      reporterName: "QR Reporter",
      description: "Unsafe act reported from QR",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path.includes("unsafeActTypeId"))).toBe(true);
    }
  });

  it("does not require unsafe act type for public unsafe act reports", () => {
    const parsed = createPublicReportCommunicationInput.safeParse({
      type: CommunicationType.UNSAFE_ACT,
      eventDatetime: new Date().toISOString(),
      reporterName: "QR Reporter",
      targetText: "Involved Worker",
      description: "Unsafe act reported from QR",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.unsafeActTypeId).toBeUndefined();
    }
    expect(shouldDeferPublicReportUnsafeActType(CommunicationType.UNSAFE_ACT)).toBe(true);
  });

  it("accepts multiple involved workers for public unsafe act reports", () => {
    const involvedEmployeeIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ];
    const parsed = createPublicReportCommunicationInput.safeParse({
      type: CommunicationType.UNSAFE_ACT,
      eventDatetime: new Date().toISOString(),
      reporterName: "QR Reporter",
      involvedEmployeeIds,
      description: "Unsafe act reported from QR",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.involvedEmployeeIds).toEqual(involvedEmployeeIds);
      expect(parsed.data.targetEmployeeId).toBeUndefined();
    }
  });

  it("rejects future event dates for public reports", () => {
    const parsed = createPublicReportCommunicationInput.safeParse({
      type: CommunicationType.UNSAFE_CONDITION,
      eventDatetime: new Date(Date.now() + 60_000).toISOString(),
      reporterName: "QR Reporter",
      description: "Unsafe condition reported from QR",
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path.includes("eventDatetime"))).toBe(true);
    }
  });

  it("does not require professional risk or near miss type for public near miss reports", () => {
    const parsed = createPublicReportCommunicationInput.safeParse({
      type: CommunicationType.NEAR_MISS,
      eventDatetime: new Date().toISOString(),
      reporterName: "QR Reporter",
      targetText: "Involved Worker",
      description: "Near miss reported from QR",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.riskThemeId).toBeUndefined();
      expect(parsed.data.nearMissTypeId).toBeUndefined();
    }
  });

  it("does not require professional risk or unsafe act type for public first aid reports", () => {
    const parsed = createPublicReportCommunicationInput.safeParse({
      type: CommunicationType.FIRST_AID,
      eventDatetime: new Date().toISOString(),
      reporterName: "QR Reporter",
      targetEmployeeId: "11111111-1111-4111-8111-111111111111",
      bodyPartId: "22222222-2222-4222-8222-222222222222",
      description: "First aid reported from QR",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.riskThemeId).toBeUndefined();
      expect(parsed.data.unsafeActTypeId).toBeUndefined();
    }
  });
});
