import { buildStorageKey } from "@/lib/helpers";
import { StorageService } from "@/lib/services/storage-service";

export const PUBLIC_REPORT_PHOTO_LIMITS = {
  maxFiles: 5,
  maxFileSizeBytes: 5 * 1024 * 1024,
  maxTotalSizeBytes: 20 * 1024 * 1024,
} as const;

const heicBrands = new Set(["heic", "heix", "hevc", "hevx"]);
const heifBrands = new Set(["mif1", "msf1"]);

function getIsoBmffBrand(bytes: Uint8Array) {
  if (bytes.length < 12) return null;
  const signature = String.fromCharCode(...bytes.slice(4, 8));
  if (signature !== "ftyp") return null;
  return String.fromCharCode(...bytes.slice(8, 12));
}

const imageSignatures = [
  {
    contentType: "image/jpeg",
    extension: "jpg",
    matches: (bytes: Uint8Array) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  {
    contentType: "image/png",
    extension: "png",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a,
  },
  {
    contentType: "image/webp",
    extension: "webp",
    matches: (bytes: Uint8Array) =>
      bytes.length >= 12 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50,
  },
  {
    contentType: "image/heic",
    extension: "heic",
    matches: (bytes: Uint8Array) => {
      const brand = getIsoBmffBrand(bytes);
      return brand ? heicBrands.has(brand) : false;
    },
  },
  {
    contentType: "image/heif",
    extension: "heif",
    matches: (bytes: Uint8Array) => {
      const brand = getIsoBmffBrand(bytes);
      return brand ? heifBrands.has(brand) : false;
    },
  },
] as const;

export class CommunicationAttachmentValidationError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 422) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function sanitizeDisplayName(value: string) {
  const name = value.split(/[\\/]/).pop()?.trim() || "photo";
  return name.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "photo";
}

export function detectAllowedImage(bytes: Uint8Array) {
  return imageSignatures.find((signature) => signature.matches(bytes)) ?? null;
}

export async function validatePublicReportPhotoFiles(files: File[]) {
  if (files.length > PUBLIC_REPORT_PHOTO_LIMITS.maxFiles) {
    throw new CommunicationAttachmentValidationError("PHOTO_LIMIT_EXCEEDED", "Too many photos attached");
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > PUBLIC_REPORT_PHOTO_LIMITS.maxTotalSizeBytes) {
    throw new CommunicationAttachmentValidationError("PHOTO_TOTAL_TOO_LARGE", "Attached photos exceed the total size limit");
  }

  const validated = [];

  for (const file of files) {
    if (file.size <= 0) {
      throw new CommunicationAttachmentValidationError("PHOTO_EMPTY", "Attached photo is empty");
    }

    if (file.size > PUBLIC_REPORT_PHOTO_LIMITS.maxFileSizeBytes) {
      throw new CommunicationAttachmentValidationError("PHOTO_TOO_LARGE", "Attached photo exceeds the size limit");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const detected = detectAllowedImage(buffer);

    if (!detected) {
      throw new CommunicationAttachmentValidationError("PHOTO_INVALID_TYPE", "Only JPG, PNG, WEBP, HEIC and HEIF photos are accepted");
    }

    validated.push({
      buffer,
      contentType: detected.contentType,
      extension: detected.extension,
      originalName: sanitizeDisplayName(file.name),
      size: file.size,
    });
  }

  return validated;
}

export async function uploadPublicReportPhotos(input: {
  plantCode: string;
  files: File[];
}) {
  const validated = await validatePublicReportPhotoFiles(input.files);
  const uploaded: Array<{
    fileKey: string;
    fileName: string;
    originalName: string;
    contentType: string;
    size: number;
  }> = [];

  try {
    for (const file of validated) {
      const fileName = `${file.originalName.replace(/\.[^.]+$/, "")}.${file.extension}`;
      const fileKey = buildStorageKey({
        plantCode: input.plantCode,
        folder: "communications/public-reports",
        fileName,
      });

      await StorageService.uploadObject({
        key: fileKey,
        contentType: file.contentType,
        body: file.buffer,
      });

      uploaded.push({
        fileKey,
        fileName,
        originalName: file.originalName,
        contentType: file.contentType,
        size: file.size,
      });
    }
  } catch (error) {
    await Promise.allSettled(uploaded.map((attachment) => StorageService.deleteObject({ key: attachment.fileKey })));
    throw error;
  }

  return uploaded;
}

export async function deleteUploadedCommunicationAttachments(
  attachments: Array<{ fileKey: string }>,
) {
  await Promise.allSettled(attachments.map((attachment) => StorageService.deleteObject({ key: attachment.fileKey })));
}
