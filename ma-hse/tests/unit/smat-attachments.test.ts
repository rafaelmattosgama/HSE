import { describe, expect, it } from "vitest";
import {
  SMAT_ATTACHMENT_LIMITS,
  getSmatAttachmentContentType,
  validateSmatAttachmentCollection,
  validateSmatAttachmentFile,
} from "@/lib/smat-attachments";

describe("SMAT attachment validation", () => {
  it("infers allowed image and document content types from file names", () => {
    expect(getSmatAttachmentContentType("photo.jpg", "")).toBe("image/jpeg");
    expect(getSmatAttachmentContentType("report.pdf", "")).toBe("application/pdf");
    expect(getSmatAttachmentContentType("sheet.xlsx", "")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });

  it("rejects unsupported file types and oversized files", () => {
    expect(validateSmatAttachmentFile({ fileName: "script.exe", contentType: "application/x-msdownload", size: 1024 })).toContain("Tipo de ficheiro");
    expect(validateSmatAttachmentFile({ fileName: "photo.jpg", contentType: "image/jpeg", size: SMAT_ATTACHMENT_LIMITS.maxFileSizeBytes + 1 })).toContain("excede");
  });

  it("rejects too many files", () => {
    const files = Array.from({ length: SMAT_ATTACHMENT_LIMITS.maxFiles + 1 }, () => ({ size: 1024 }));

    expect(validateSmatAttachmentCollection(files)).toContain("maximo");
  });
});
