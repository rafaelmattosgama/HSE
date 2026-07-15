import { RoleCode, type Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import { requireAuth } from "@/lib/rbac/guards";
import { getPlantByCode } from "@/lib/plant";
import { ALL_PLANTS_SCOPE, isAllPlantsScope } from "@/lib/plant-scope";
import { prisma } from "@/lib/prisma";

const AGENT_AUDIT_ROLES = [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY] as const;
const AGENT_AUDIT_RESULTS = new Set(["success", "blocked", "error"]);
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const SENSITIVE_VALUE_PATTERN = /sk-[a-z0-9_-]+|OPENAI_API_KEY|DATABASE_URL|TOKEN_PEPPER|NEXTAUTH_SECRET|stack trace/i;

type AgentAuditAfter = {
  requestId?: unknown;
  eventType?: unknown;
  result?: unknown;
  timestamp?: unknown;
  userId?: unknown;
  plantCode?: unknown;
  plantId?: unknown;
  role?: unknown;
  toolName?: unknown;
  confirmationId?: unknown;
  messageLength?: unknown;
  mode?: unknown;
  errorCode?: unknown;
  status?: unknown;
  summary?: unknown;
  input?: unknown;
  outputSummary?: unknown;
};

function asString(value: unknown) {
  if (typeof value !== "string") return null;
  return SENSITIVE_VALUE_PATTERN.test(value) ? "[redacted]" : value;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parsePositiveInt(value: string | null, fallback: number, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hasCorporateAuditAccess(roles: { role: RoleCode }[]) {
  if (roles.some((entry) => entry.role === RoleCode.N0_ADMIN)) return RoleCode.N0_ADMIN;
  if (roles.some((entry) => entry.role === RoleCode.N1_CORPORATE)) return RoleCode.N1_CORPORATE;
  return null;
}

function resolvePlantRole(roles: { plantCode: string | null; role: RoleCode }[], plantCode: string) {
  return roles.find((entry) => entry.plantCode === plantCode && entry.role === RoleCode.N3_SAFETY)?.role ?? null;
}

export async function resolveAgentAuditAccess(plantCode: string) {
  const auth = await requireAuth();
  if ("error" in auth && auth.error) return { error: auth.error };

  const roles = auth.session.user.plantRoles;
  const corporateRole = hasCorporateAuditAccess(roles);
  if (isAllPlantsScope(plantCode)) {
    if (!corporateRole) {
      return { error: fail("FORBIDDEN", "Agent audit access denied", 403) };
    }
    return {
      session: auth.session,
      role: corporateRole,
      scope: "global" as const,
      plant: null,
    };
  }

  const plant = await getPlantByCode(plantCode);
  const plantRole = corporateRole ?? resolvePlantRole(roles, plant.code);
  if (!plantRole || !AGENT_AUDIT_ROLES.includes(plantRole as (typeof AGENT_AUDIT_ROLES)[number])) {
    return { error: fail("FORBIDDEN", "Agent audit access denied", 403) };
  }

  return {
    session: auth.session,
    role: plantRole,
    scope: "plant" as const,
    plant,
  };
}

function sanitizeObjectSummary(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const allowed: Record<string, unknown> = {};
  for (const key of [
    "fields",
    "ids",
    "stringLengths",
    "messageLength",
    "hasMessage",
    "responseLength",
    "originalResponseLength",
    "truncated",
    "hasConfirmation",
    "toolCallCount",
    "maxToolCalls",
    "maxOutputChars",
    "type",
  ]) {
    if (key in record) allowed[key] = sanitizeSummaryValue(record[key]);
  }
  return Object.keys(allowed).length ? allowed : null;
}

function sanitizeSummaryValue(value: unknown): unknown {
  if (typeof value === "string") return asString(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 10).map((entry) => sanitizeSummaryValue(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 20)
        .map(([key, entry]) => [key, sanitizeSummaryValue(entry)]),
    );
  }
  return null;
}

function sanitizeAfter(diffJson: unknown) {
  const root = diffJson && typeof diffJson === "object" ? (diffJson as Record<string, unknown>) : {};
  const after = root.after && typeof root.after === "object" ? (root.after as AgentAuditAfter) : {};
  const inputSummary = sanitizeObjectSummary(after.input);
  const outputSummary = sanitizeObjectSummary(after.outputSummary);
  return {
    requestId: asString(after.requestId),
    eventType: asString(after.eventType),
    result: asString(after.result),
    timestamp: asString(after.timestamp),
    userId: asString(after.userId),
    plantCode: asString(after.plantCode),
    plantId: asString(after.plantId),
    role: asString(after.role),
    toolName: asString(after.toolName),
    confirmationId: asString(after.confirmationId),
    messageLength: asNumber(after.messageLength),
    mode: asString(after.mode),
    errorCode: asString(after.errorCode),
    status: typeof after.status === "string" || typeof after.status === "number" ? String(after.status) : null,
    summary: asString(after.summary),
    inputSummary,
    outputSummary,
  };
}

function buildJsonFilter(path: string[], equals: string) {
  return {
    diffJson: {
      path,
      equals,
    },
  } as Prisma.AuditLogWhereInput;
}

export async function listAgentAuditLogs(input: {
  plantCode: string;
  searchParams: URLSearchParams;
}) {
  const access = await resolveAgentAuditAccess(input.plantCode);
  if ("error" in access && access.error) return { error: access.error };

  const page = parsePositiveInt(input.searchParams.get("page"), 1);
  const pageSize = parsePositiveInt(input.searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const dateFrom = parseDate(input.searchParams.get("dateFrom"));
  const dateTo = parseDate(input.searchParams.get("dateTo"));
  const eventType = input.searchParams.get("eventType")?.trim() || null;
  const toolName = input.searchParams.get("toolName")?.trim() || null;
  const result = input.searchParams.get("result")?.trim() || null;
  const requestId = input.searchParams.get("requestId")?.trim() || null;
  const userId = input.searchParams.get("userId")?.trim() || null;

  const where: Prisma.AuditLogWhereInput = {
    entityType: "AgentInteraction",
    ...(access.scope === "plant" ? { plantId: access.plant.id } : {}),
    ...(dateFrom || dateTo
      ? {
          createdAt: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
    AND: [
      ...(eventType ? [buildJsonFilter(["after", "eventType"], eventType)] : []),
      ...(toolName ? [buildJsonFilter(["after", "toolName"], toolName)] : []),
      ...(result && AGENT_AUDIT_RESULTS.has(result) ? [buildJsonFilter(["after", "result"], result)] : []),
      ...(requestId ? [buildJsonFilter(["after", "requestId"], requestId)] : []),
      ...(userId && (access.role === RoleCode.N0_ADMIN || access.role === RoleCode.N1_CORPORATE)
        ? [buildJsonFilter(["after", "userId"], userId)]
        : []),
    ],
  };

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        action: true,
        actorUserId: true,
        plantId: true,
        createdAt: true,
        diffJson: true,
      },
    }),
  ]);

  return {
    data: {
      access: {
        scope: access.scope,
        role: access.role,
        plantCode: access.scope === "plant" ? access.plant.code : ALL_PLANTS_SCOPE,
        canFilterUser: access.role === RoleCode.N0_ADMIN || access.role === RoleCode.N1_CORPORATE,
      },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      logs: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        action: row.action,
        actorUserId: row.actorUserId,
        ...sanitizeAfter(row.diffJson),
      })),
    },
  };
}
