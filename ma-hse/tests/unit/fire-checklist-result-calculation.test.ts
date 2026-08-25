import { FireChecklistItemValue, FireChecklistResult } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  calculateFireChecklistOverallResult,
  type FireChecklistItemResponseForResult,
} from "@/lib/services/fire-equipment-state-service";

function response(overrides: Partial<FireChecklistItemResponseForResult> = {}): FireChecklistItemResponseForResult {
  return {
    isCritical: false,
    value: FireChecklistItemValue.OK,
    ...overrides,
  };
}

/**
 * §3.5: overallResult is always computed from itemResponses, never accepted
 * as a free field from the form — FAILED whenever any critical item is NOK,
 * regardless of how many non-critical items are also NOK.
 */
describe("calculateFireChecklistOverallResult", () => {
  it("returns PASSED when every response is OK (or N/A)", () => {
    const result = calculateFireChecklistOverallResult([
      response({ isCritical: true, value: FireChecklistItemValue.OK }),
      response({ isCritical: false, value: FireChecklistItemValue.OK }),
      response({ isCritical: false, value: FireChecklistItemValue.NOT_APPLICABLE }),
    ]);
    expect(result).toBe(FireChecklistResult.PASSED);
  });

  it("returns PASSED_WITH_OBSERVATIONS when a non-critical item is NOK and every critical item is OK", () => {
    const result = calculateFireChecklistOverallResult([
      response({ isCritical: true, value: FireChecklistItemValue.OK }),
      response({ isCritical: false, value: FireChecklistItemValue.NOK }),
    ]);
    expect(result).toBe(FireChecklistResult.PASSED_WITH_OBSERVATIONS);
  });

  it("returns FAILED when a critical item is NOK, even alongside a non-critical NOK", () => {
    const result = calculateFireChecklistOverallResult([
      response({ isCritical: true, value: FireChecklistItemValue.NOK }),
      response({ isCritical: false, value: FireChecklistItemValue.NOK }),
    ]);
    expect(result).toBe(FireChecklistResult.FAILED);
  });

  it("returns FAILED for a critical NOK even when there is no non-critical item at all", () => {
    const result = calculateFireChecklistOverallResult([response({ isCritical: true, value: FireChecklistItemValue.NOK })]);
    expect(result).toBe(FireChecklistResult.FAILED);
  });

  it("returns PASSED for an empty response list (nothing to fail on)", () => {
    expect(calculateFireChecklistOverallResult([])).toBe(FireChecklistResult.PASSED);
  });
});
