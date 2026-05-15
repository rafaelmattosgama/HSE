import { describe, expect, it } from "vitest";
import { buildSewoRootCauseTopEntries, getSewoRootCauseCount, getSewoRootCauseLabels } from "@/lib/sewo-root-causes";

describe("getSewoRootCauseCount", () => {
  it("counts template root cause details marked as yes", () => {
    expect(
      getSewoRootCauseCount({
        rootCauseDetails: [
          { label: "A", isRootCause: true },
          { label: "B", isRootCause: "YES" },
          { label: "C", rootCause: "yes" },
          { label: "D", isRootCause: false },
          { label: "E", isRootCause: "NO" },
        ],
      }),
    ).toBe(3);
  });

  it("counts structured SEWO cause selections when template details are absent", () => {
    expect(
      getSewoRootCauseCount({
        templateData: null,
        causeSelections: [
          { selected: true, isRootCause: true },
          { selected: false, isRootCause: true },
          { selected: true, isRootCause: false },
          { selected: true, isRootCause: "YES" },
        ],
      }),
    ).toBe(2);
  });

  it("does not double count duplicated template and structured data", () => {
    expect(
      getSewoRootCauseCount({
        templateData: {
          rootCauseDetails: [
            { label: "A", isRootCause: true },
            { label: "B", isRootCause: true },
          ],
        },
        causeSelections: [
          { selected: true, isRootCause: true },
          { selected: true, isRootCause: true },
        ],
      }),
    ).toBe(2);
  });

  it("returns root cause labels from template data", () => {
    expect(
      getSewoRootCauseLabels({
        rootCauseDetails: [
          { label: "1.1 Inadequate training", isRootCause: true },
          { label: "2.1 Lack of concentration", isRootCause: false },
          { label: "3.1 PPE inadequate", selected: false, isRootCause: true },
          { label: "4.1 Excess self-confidence", isRootCause: "YES" },
        ],
      }),
    ).toEqual(["1.1 Inadequate training", "4.1 Excess self-confidence"]);
  });

  it("returns root cause labels from structured cause selections when template labels are absent", () => {
    expect(
      getSewoRootCauseLabels({
        templateData: null,
        causeSelections: [
          { selected: true, isRootCause: true, causeItem: { label: "6.2 Lack of maintenance" } },
          { selected: true, isRootCause: false, causeItem: { label: "6.5 Failure / breakage" } },
          { selected: false, isRootCause: true, causeItem: { label: "7.2 Procedure inadequate" } },
        ],
      }),
    ).toEqual(["6.2 Lack of maintenance"]);
  });

  it("builds a top five root cause ranking by percentage", () => {
    expect(
      buildSewoRootCauseTopEntries([
        { rootCauseDetails: [{ label: "A", isRootCause: true }, { label: "B", isRootCause: true }] },
        { rootCauseDetails: [{ label: "A", isRootCause: true }] },
        { rootCauseDetails: [{ label: "C", isRootCause: true }] },
      ]),
    ).toEqual([
      { label: "A", count: 2, percentage: 50 },
      { label: "B", count: 1, percentage: 25 },
      { label: "C", count: 1, percentage: 25 },
    ]);
  });
});
