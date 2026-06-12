import { randomUUID } from "crypto";
import { CommunicationStatus, CommunicationType, LeaveClassification } from "@prisma/client";
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
    FIVE_S_IMPROVEMENT: "Melhoria 5S's",
    IMPROVEMENT_SUGGESTION: "Sugestão de melhoria",
  };

  return labels[type] ?? type;
}

export function formatInjuryClassification(classification?: LeaveClassification | null) {
  const labels: Record<LeaveClassification, string> = {
    MINOR: "Minor Injury",
    SERIOUS: "Serious Injury",
    FATAL: "Fatal",
  };

  return classification ? labels[classification] : "-";
}

export function formatCommunicationStatus(status: CommunicationStatus | string) {
  const labels: Record<string, string> = {
    VALID_OPEN: "To Do",
    CLOSED: "Closed",
    ONGOING: "On Going",
    SUBMITTED: "To Do",
    PENDING_VALIDATION: "Pending Validation",
    REJECTED: "Reject",
    INVALID: "Reject",
  };

  return labels[status] ?? status;
}

export function normalizeCommunicationStatus(status: CommunicationStatus | string) {
  const labels: Record<string, "to_do" | "closed" | "on_going" | "pending_validation" | "reject"> = {
    SUBMITTED: "to_do",
    VALID_OPEN: "to_do",
    CLOSED: "closed",
    ONGOING: "on_going",
    PENDING_VALIDATION: "pending_validation",
    REJECTED: "reject",
    INVALID: "reject",
  };

  return labels[status] ?? "to_do";
}

export function getCommunicationStatusClasses(status: CommunicationStatus | string) {
  const normalized = normalizeCommunicationStatus(status);

  if (normalized === "closed") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (normalized === "on_going" || normalized === "pending_validation") {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-red-100 text-red-700";
}

export function getActionStatusClasses(status: string) {
  const normalized = status.toUpperCase();

  if (normalized === "CLOSED") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (normalized === "ONGOING") {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-rose-100 text-rose-700";
}

export function formatActionCode(plantCode: string, sequenceNumber?: number | null) {
  if (!sequenceNumber) {
    return `${plantCode.toUpperCase()}-PENDING`;
  }

  return `${plantCode.toUpperCase()}-${String(sequenceNumber).padStart(4, "0")}`;
}
