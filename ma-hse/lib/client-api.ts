import type { ApiEnvelope } from "@/lib/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly errorCode?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isApiEnvelope<T>(value: unknown): value is ApiEnvelope<T> {
  return Boolean(value && typeof value === "object" && "ok" in value);
}

export async function parseApiResponse<T>(response: Response) {
  const raw = await response.text();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    return isApiEnvelope<T>(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function requireApiResponse<T>(response: Response, fallbackMessage: string) {
  const json = await parseApiResponse<T>(response);

  if (!json) {
    throw new ApiError(fallbackMessage);
  }

  if (!response.ok || !json.ok) {
    throw new ApiError(json.message ?? fallbackMessage, json.errorCode);
  }

  return json;
}

/**
 * Uploads a file through the app server (`/api/storage/upload` by default),
 * which relays it to storage server-side. Uploads never go straight from the
 * browser to the storage endpoint: in production that endpoint is only
 * reachable from the app's own network, not from the user's browser.
 */
export async function uploadAttachment(input: {
  plantCode: string;
  folder: string;
  file: File;
  contentType?: string;
  fallbackErrorMessage?: string;
  endpoint?: string;
}) {
  const fallbackErrorMessage = input.fallbackErrorMessage ?? "Failed to upload file";
  const formData = new FormData();
  formData.append("file", input.file);
  formData.append("plantCode", input.plantCode);
  formData.append("folder", input.folder);
  formData.append("contentType", input.contentType ?? input.file.type ?? "application/octet-stream");

  const response = await fetch(input.endpoint ?? "/api/storage/upload", {
    method: "POST",
    body: formData,
  });

  const json = await requireApiResponse<{ bucket: string; key: string }>(response, fallbackErrorMessage);
  if (!json.data) {
    throw new Error(fallbackErrorMessage);
  }

  return json.data;
}
