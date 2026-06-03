import { describe, expect, it } from "vitest";
import {
  CommunicationAttachmentValidationError,
  PUBLIC_REPORT_PHOTO_LIMITS,
  detectAllowedImage,
  validatePublicReportPhotoFiles,
} from "@/lib/services/communication-attachment-service";

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const heicBytes = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0x00]);
const heifBytes = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31, 0x00]);

describe("communication attachment validation", () => {
  it("detects allowed image formats by magic bytes", () => {
    expect(detectAllowedImage(jpegBytes)?.contentType).toBe("image/jpeg");
    expect(detectAllowedImage(pngBytes)?.contentType).toBe("image/png");
    expect(detectAllowedImage(webpBytes)?.contentType).toBe("image/webp");
    expect(detectAllowedImage(heicBytes)?.contentType).toBe("image/heic");
    expect(detectAllowedImage(heifBytes)?.contentType).toBe("image/heif");
  });

  it("accepts HEIC and HEIF photos from mobile devices", async () => {
    const files = [
      new File([heicBytes], "camera.heic", { type: "image/heic" }),
      new File([heifBytes], "gallery.heif", { type: "image/heif" }),
    ];

    await expect(validatePublicReportPhotoFiles(files)).resolves.toEqual([
      expect.objectContaining({ contentType: "image/heic", extension: "heic" }),
      expect.objectContaining({ contentType: "image/heif", extension: "heif" }),
    ]);
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

  it("rejects photos above the per-file size limit", async () => {
    const oversizedPhoto = new File(
      [new Uint8Array(PUBLIC_REPORT_PHOTO_LIMITS.maxFileSizeBytes + 1)],
      "oversized.jpg",
      { type: "image/jpeg" },
    );

    await expect(validatePublicReportPhotoFiles([oversizedPhoto])).rejects.toMatchObject({
      code: "PHOTO_TOO_LARGE",
    } satisfies Partial<CommunicationAttachmentValidationError>);
  });
});
