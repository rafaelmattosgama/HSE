import { describe, expect, it } from "vitest";
import { CommunicationType } from "@prisma/client";
import { groupUnsafeConditionTypes } from "@/components/feature/unsafe-condition-type-select";
import { getMissingCommunicationClassificationFields } from "@/lib/communication-classification";
import { DEFAULT_UNSAFE_CONDITION_TYPES } from "@/lib/defaults/unsafe-condition-types";

describe("unsafe condition type classification", () => {
  it("keeps the default catalog grouped by category and alphabetically sorted", () => {
    const groups = groupUnsafeConditionTypes(
      DEFAULT_UNSAFE_CONDITION_TYPES.map((entry) => ({
        id: entry.code,
        ...entry,
      })),
    );

    expect(groups.map((group) => group.category)).toEqual([
      "FACILITIES / EQUIPMENT",
      "PROCEDURE / SYSTEMS",
    ]);

    for (const group of groups) {
      const names = group.types.map((type) => type.name);
      expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right)));
    }
  });

  it("requires unsafe condition type before internal validation can approve unsafe condition communications", () => {
    expect(
      getMissingCommunicationClassificationFields({
        type: CommunicationType.UNSAFE_CONDITION,
      }),
    ).toContain("unsafeConditionTypeId");

    expect(
      getMissingCommunicationClassificationFields({
        type: CommunicationType.UNSAFE_CONDITION,
        unsafeConditionTypeId: "condition-type-id",
      }),
    ).not.toContain("unsafeConditionTypeId");
  });
});

