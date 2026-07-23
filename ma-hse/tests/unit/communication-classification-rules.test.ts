import { CommunicationType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { getMissingCommunicationClassificationFields } from "@/lib/communication-classification";

describe("communication classification rules", () => {
  it("requires the expected classification fields for each communication type", () => {
    expect(
      getMissingCommunicationClassificationFields({
        type: CommunicationType.UNSAFE_ACT,
      }),
    ).toEqual(["unsafeActTypeId"]);

    expect(
      getMissingCommunicationClassificationFields({
        type: CommunicationType.UNSAFE_CONDITION,
      }),
    ).toEqual(["unsafeConditionTypeId"]);

    expect(
      getMissingCommunicationClassificationFields({
        type: CommunicationType.NEAR_MISS,
      }),
    ).toEqual(["riskThemeId", "nearMissTypeId"]);

    expect(
      getMissingCommunicationClassificationFields({
        type: CommunicationType.FIRST_AID,
      }),
    ).toEqual(["riskThemeId"]);

    expect(
      getMissingCommunicationClassificationFields({
        type: CommunicationType.ACCIDENT,
      }),
    ).toEqual(["riskThemeId"]);
  });

  it("accepts complete classification data for every communication type", () => {
    const shared = {
      riskThemeId: "risk-theme-1",
      unsafeActTypeId: "unsafe-act-1",
      unsafeConditionTypeId: "unsafe-condition-1",
      nearMissTypeId: "near-miss-1",
    };

    expect(
      getMissingCommunicationClassificationFields({
        type: CommunicationType.UNSAFE_ACT,
        ...shared,
      }),
    ).toEqual([]);

    expect(
      getMissingCommunicationClassificationFields({
        type: CommunicationType.UNSAFE_CONDITION,
        ...shared,
      }),
    ).toEqual([]);

    expect(
      getMissingCommunicationClassificationFields({
        type: CommunicationType.NEAR_MISS,
        ...shared,
      }),
    ).toEqual([]);

    expect(
      getMissingCommunicationClassificationFields({
        type: CommunicationType.FIRST_AID,
        ...shared,
      }),
    ).toEqual([]);

    expect(
      getMissingCommunicationClassificationFields({
        type: CommunicationType.ACCIDENT,
        ...shared,
      }),
    ).toEqual([]);
  });
});
