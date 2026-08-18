import { randomUUID } from "crypto";
import type { RoleCode } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";

export type AgentAuditResult = "success" | "blocked" | "error";

export type AgentAuditContext = {
  userId?: string | null;
  plantId?: string | null;
  plantCode?: string | null;
  role?: RoleCode | string | null;
  requestId?: string | null;
};

export type AgentAuditEvent = {
  requestId?: string | null;
  ctx?: AgentAuditContext | null;
  eventType: string;
  result: AgentAuditResult;
  toolName?: string | null;
  confirmationId?: string | null;
  messageLength?: number | null;
  mode?: "mock" | "real" | null;
  errorCode?: string | null;
  status?: number | string | null;
  summary?: string | null;
  input?: unknown;
  outputSummary?: unknown;
};

const SENSITIVE_KEY_PATTERN = /password|token|secret|api.?key|authorization|cookie|session|env|database.?url/i;

export function createAgentRequestId() {
  return randomUUID();
}

export function summarizeForAgentAudit(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[truncated]";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value.length > 220 ? `${value.slice(0, 217)}...` : value;
  if (typeof value === "number" || typeof value === "boolean" || value === null || value === undefined) return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.slice(0, 12).map((entry) => summarizeForAgentAudit(entry, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 30)
        .map(([key, entry]) => {
          if (SENSITIVE_KEY_PATTERN.test(key)) return [key, "[redacted]"];
          return [key, summarizeForAgentAudit(entry, depth + 1)];
        }),
    );
  }
  return String(value);
}

export function buildAgentRequestSummary(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { bodyType: body === null ? "null" : typeof body };
  }

  const record = body as Record<string, unknown>;
  return {
    fields: Object.keys(record).slice(0, 20),
    plantCode: typeof record.plantCode === "string" ? record.plantCode.slice(0, 40) : undefined,
    messageLength: typeof record.message === "string" ? record.message.length : undefined,
    hasMessage: typeof record.message === "string",
    intent: typeof record.intent === "string" ? record.intent.slice(0, 80) : undefined,
    confirmationId: typeof record.confirmationId === "string" ? record.confirmationId : undefined,
    confirmationAction: typeof record.confirmationAction === "string" ? record.confirmationAction : undefined,
  };
}

function buildAuditPayload(input: AgentAuditEvent) {
  const ctx = input.ctx;
  const requestId = input.requestId ?? ctx?.requestId ?? createAgentRequestId();
  const timestamp = new Date().toISOString();

  return {
    requestId,
    eventType: input.eventType,
    result: input.result,
    timestamp,
    userId: ctx?.userId ?? null,
    plantCode: ctx?.plantCode ?? null,
    plantId: ctx?.plantId ?? null,
    role: ctx?.role ?? null,
    toolName: input.toolName ?? null,
    confirmationId: input.confirmationId ?? null,
    messageLength: input.messageLength ?? null,
    mode: input.mode ?? null,
    errorCode: input.errorCode ?? null,
    status: input.status ?? null,
    summary: input.summary ? summarizeForAgentAudit(input.summary) : null,
    input: input.input === undefined ? null : summarizeForAgentAudit(input.input),
    outputSummary: input.outputSummary === undefined ? null : summarizeForAgentAudit(input.outputSummary),
  };
}

export async function writeAgentAuditEvent(input: AgentAuditEvent) {
  const after = buildAuditPayload(input);

  logger.info(after, "agent_audit_event");

  try {
    await writeAuditLog({
      entityType: "AgentInteraction",
      entityId: after.confirmationId ?? after.requestId,
      action: `AGENT_${input.eventType.toUpperCase()}`,
      actorUserId: after.userId,
      plantId: after.plantId,
      diff: {
        before: null,
        after,
        fieldsChanged: Object.keys(after),
      },
    });
  } catch (error) {
    logger.error(
      {
        error,
        requestId: after.requestId,
        eventType: after.eventType,
        userId: after.userId,
        plantCode: after.plantCode,
      },
      "agent_audit_write_failed",
    );
  }

  return after;
}
