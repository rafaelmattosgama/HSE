export const SMAT_ATTACHMENT_LIMITS = {
  maxFiles: 10,
  maxFileSizeBytes: 10 * 1024 * 1024,
  maxTotalSizeBytes: 50 * 1024 * 1024,
  maxCaptionLength: 200,
} as const;

const allowedContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

const extensionContentTypes = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".pdf", "application/pdf"],
  [".doc", "application/msword"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".xls", "application/vnd.ms-excel"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  [".txt", "text/plain"],
  [".csv", "text/csv"],
]);

export const SMAT_ATTACHMENT_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".txt",
  ".csv",
].join(",");

function extensionFromName(fileName: string) {
  const match = fileName.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

function normalizeContentType(contentType?: string) {
  return contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function getSmatAttachmentContentType(fileName: string, contentType?: string) {
  const normalized = normalizeContentType(contentType);
  if (allowedContentTypes.has(normalized)) return normalized;

  const inferred = extensionContentTypes.get(extensionFromName(fileName));
  return inferred ?? "application/octet-stream";
}

export function validateSmatAttachmentFile(input: {
  fileName: string;
  contentType?: string;
  size: number;
}) {
  const contentType = getSmatAttachmentContentType(input.fileName, input.contentType);

  if (!allowedContentTypes.has(contentType)) {
    return "Tipo de ficheiro nao permitido. Use JPG, PNG, WEBP, PDF, DOC, DOCX, XLS, XLSX, TXT ou CSV.";
  }

  if (input.size <= 0) {
    return "O ficheiro esta vazio.";
  }

  if (input.size > SMAT_ATTACHMENT_LIMITS.maxFileSizeBytes) {
    return `O ficheiro excede o limite de ${SMAT_ATTACHMENT_LIMITS.maxFileSizeBytes / 1024 / 1024} MB.`;
  }

  return null;
}

export function validateSmatAttachmentCollection(files: Array<{ size: number }>) {
  if (files.length > SMAT_ATTACHMENT_LIMITS.maxFiles) {
    return `Pode anexar no maximo ${SMAT_ATTACHMENT_LIMITS.maxFiles} ficheiros.`;
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > SMAT_ATTACHMENT_LIMITS.maxTotalSizeBytes) {
    return `O total de anexos excede ${SMAT_ATTACHMENT_LIMITS.maxTotalSizeBytes / 1024 / 1024} MB.`;
  }

  return null;
}

export function isSmatPreviewableImage(fileName: string, contentType?: string) {
  return getSmatAttachmentContentType(fileName, contentType).startsWith("image/");
}
