import { ZodError, ZodSchema } from "zod";
import { fail } from "@/lib/api";

export async function parseBody<T>(request: Request, schema: ZodSchema<T>) {
  try {
    const json = await request.json();
    return {
      data: schema.parse(json),
    };
  } catch (error) {
    if (error instanceof ZodError) {
      const firstIssue = error.issues[0];
      const field = firstIssue?.path?.join(".");
      const detail = firstIssue?.message ?? "Invalid payload";
      const message = field ? `${field}: ${detail}` : detail;

      return {
        error: fail("INVALID_INPUT", message, 422),
      };
    }

    return {
      error: fail("INVALID_INPUT", error instanceof Error ? error.message : "Invalid payload", 422),
    };
  }
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch {
    return false;
  }
}
