import type { ApiEnvelope } from "@/lib/api";

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
    throw new Error(fallbackMessage);
  }

  if (!response.ok || !json.ok) {
    throw new Error(json.message ?? fallbackMessage);
  }

  return json;
}
