import { describe, expect, it } from "vitest";
import { createOccupationalHealthExamInput } from "@/lib/validation/dtos";

describe("occupational-health examination input", () => {
  const attachment = {
    fileKey: "occupational-health/exams/medical.pdf",
    fileName: "medical.pdf",
    contentType: "application/pdf",
  } as const;

  it("accepts a PDF attached to its specific exam", () => {
    const parsed = createOccupationalHealthExamInput.safeParse({
      examDate: "2026-08-01",
      validUntil: "2027-08-01",
      status: "FIT",
      newAttachments: [attachment],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a validity date that comes before the examination", () => {
    const parsed = createOccupationalHealthExamInput.safeParse({
      examDate: "2026-08-02",
      validUntil: "2026-08-01",
      status: "UNFIT",
      newAttachments: [attachment],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects file formats outside PDF and images", () => {
    const parsed = createOccupationalHealthExamInput.safeParse({
      examDate: "2026-08-01",
      validUntil: "2027-08-01",
      status: "FIT_CONDITIONAL",
      newAttachments: [{ ...attachment, contentType: "text/plain" }],
    });
    expect(parsed.success).toBe(false);
  });
});
