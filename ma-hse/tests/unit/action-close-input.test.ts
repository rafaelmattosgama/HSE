import { describe, expect, it } from "vitest";
import { bulkCloseActionInput, closeActionInput } from "@/lib/validation/dtos";

describe("action close validation", () => {
  it("accepts a closure date when closing a single action", () => {
    const parsed = closeActionInput.parse({
      closureComment: "Closed after corrective action.",
      closedAt: "2026-05-24",
      evidence: [],
    });

    expect(parsed.closedAt).toBeInstanceOf(Date);
    expect(parsed.closedAt.toISOString().slice(0, 10)).toBe("2026-05-24");
  });

  it("requires a closure date for batch closing", () => {
    const parsed = bulkCloseActionInput.safeParse({
      actionIds: ["11111111-1111-4111-8111-111111111111"],
      closureComment: "Closed in bulk.",
      evidence: [],
    });

    expect(parsed.success).toBe(false);
  });
});
