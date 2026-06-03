import { describe, expect, it } from "vitest";
import {
  CommunicationAttachmentValidationError,
  detectAllowedImage,
  validatePublicReportPhotoFiles,
} from "@/lib/services/communication-attachment-service";

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

describe("communication attachment validation", () => {
  it("detects allowed image formats by magic bytes", () => {
    expect(detectAllowedImage(jpegBytes)?.contentType).toBe("image/jpeg");
    expect(detectAllowedImage(pngBytes)?.contentType).toBe("image/png");
    expect(detectAllowedImage(webpBytes)?.contentType).toBe("image/webp");
  });

  it("rejects files that are not real images", async () => {
    const file = new File(["<svg></svg>"], "bad.svg", { type: "image/svg+xml" });

    await expect(validatePublicReportPhotoFiles([file])).rejects.toMatchObject({
      code: "PHOTO_INVALID_TYPE",
    } satisfies Partial<CommunicationAttachmentValidationError>);
  });

  it("rejects too many files", async () => {
    const files = Array.from({ length: 6 }, (_, index) => new File([pngBytes], `photo-${index}.png`, { type: "image/png" }));

    await expect(validatePublicReportPhotoFiles(files)).rejects.toMatchObject({
      code: "PHOTO_LIMIT_EXCEEDED",
    } satisfies Partial<CommunicationAttachmentValidationError>);
  });
});
