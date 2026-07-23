import { CommunicationType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  createCommunicationInput,
  updateCommunicationInput,
} from "@/lib/validation/dtos";

const firstAidInput = {
  type: CommunicationType.FIRST_AID,
  eventDatetime: "2026-01-15T10:00:00.000Z",
  reporterName: "Ana Silva",
  targetEmployeeId: "11111111-1111-4111-8111-111111111111",
  bodyPartId: "22222222-2222-4222-8222-222222222222",
  riskThemeId: "33333333-3333-4333-8333-333333333333",
  description: "Minor injury treated on site.",
};

describe("First Aid communication input", () => {
  it.each([
    ["create", createCommunicationInput],
    ["update", updateCommunicationInput],
  ] as const)("allows %s without unsafe act type", (_operation, schema) => {
    const parsed = schema.safeParse(firstAidInput);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.unsafeActTypeId).toBeUndefined();
    }
  });

  it.each([
    ["create", createCommunicationInput],
    ["update", updateCommunicationInput],
  ] as const)("strips residual unsafe act type from First Aid %s payloads", (_operation, schema) => {
    const parsed = schema.safeParse({
      ...firstAidInput,
      unsafeActTypeId: "44444444-4444-4444-8444-444444444444",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.unsafeActTypeId).toBeUndefined();
    }
  });

  it("preserves the existing unsafe act requirement and value for Unsafe Act", () => {
    const unsafeActTypeId = "44444444-4444-4444-8444-444444444444";
    const parsed = createCommunicationInput.safeParse({
      type: CommunicationType.UNSAFE_ACT,
      eventDatetime: "2026-01-15T10:00:00.000Z",
      reporterName: "Ana Silva",
      targetText: "Worker involved",
      unsafeActTypeId,
      description: "Worker bypassed a required procedure.",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.unsafeActTypeId).toBe(unsafeActTypeId);
    }
  });
});
