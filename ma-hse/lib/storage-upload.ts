import { fail } from "@/lib/api";
import { uploadAttachmentInput, type UploadAttachmentInput } from "@/lib/validation/dtos";

export const ATTACHMENT_UPLOAD_LIMITS = {
  maxFileSizeBytes: 15 * 1024 * 1024,
} as const;

function isFormFile(value: FormDataEntryValue | null): value is File {
  return value !== null && typeof value === "object" && "arrayBuffer" in value && "size" in value && "name" in value;
}

export type ParsedAttachmentUpload = UploadAttachmentInput & { file: File; fileName: string };

/**
 * Reads a `multipart/form-data` attachment upload (fields: `file`, `plantCode`,
 * `folder`, `contentType`). Uploads always go through the app server rather than
 * a presigned storage URL, since the storage endpoint is only reachable from the
 * server's own network in production, not from the browser.
 */
export async function parseAttachmentUploadForm(request: Request): Promise<
  | { data: ParsedAttachmentUpload }
  | { error: Response }
> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return { error: fail("INVALID_INPUT", "Expected multipart/form-data", 422) };
  }

  const file = formData.get("file");
  if (!isFormFile(file) || file.size === 0) {
    return { error: fail("INVALID_INPUT", "file is required", 422) };
  }

  if (file.size > ATTACHMENT_UPLOAD_LIMITS.maxFileSizeBytes) {
    const limitMb = Math.floor(ATTACHMENT_UPLOAD_LIMITS.maxFileSizeBytes / (1024 * 1024));
    return { error: fail("FILE_TOO_LARGE", `File exceeds the ${limitMb}MB limit`, 413) };
  }

  const parsed = uploadAttachmentInput.safeParse({
    plantCode: formData.get("plantCode"),
    contentType: formData.get("contentType") || file.type || "application/octet-stream",
    folder: formData.get("folder"),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const field = firstIssue?.path?.join(".");
    const detail = firstIssue?.message ?? "Invalid payload";
    return { error: fail("INVALID_INPUT", field ? `${field}: ${detail}` : detail, 422) };
  }

  return {
    data: {
      ...parsed.data,
      file,
      fileName: file.name || "upload.bin",
    },
  };
}
