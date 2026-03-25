import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { env } from "@/lib/env";

export function buildRateLimitKey(request: NextRequest, parts: string[]) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded ?? "unknown";
  return `${parts.join(":")}:${ip}`;
}

export function buildStorageKey(input: {
  plantCode: string;
  folder: string;
  fileName: string;
}) {
  const extension = input.fileName.includes(".") ? input.fileName.split(".").pop() : "bin";
  return `${input.plantCode}/${input.folder}/${randomUUID()}.${extension}`;
}

export function appUrl(path: string) {
  return `${env.APP_URL}${path}`;
}