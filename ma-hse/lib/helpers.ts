import { randomUUID } from "crypto";
import { CommunicationStatus, CommunicationType } from "@prisma/client";
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

export function formatCommunicationType(type: CommunicationType | string) {
  const labels: Record<string, string> = {
    UNSAFE_ACT: "Unsafe Act",
    UNSAFE_CONDITION: "Unsafe Condition",
    NEAR_MISS: "Near Miss",
    FIRST_AID: "First Aid",
    ACCIDENT: "Injury",
  };

  return labels[type] ?? type;
}

export function formatCommunicationStatus(status: CommunicationStatus | string) {
  const labels: Record<string, string> = {
    VALID_OPEN: "Open",
    CLOSED: "Closed",
    ONGOING: "On Going",
    SUBMITTED: "Submitted",
    PENDING_VALIDATION: "Pending Validation",
    REJECTED: "Rejected",
    INVALID: "Invalid",
  };

  return labels[status] ?? status;
}
