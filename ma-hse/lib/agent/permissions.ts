import { RoleCode } from "@prisma/client";
import type { Session } from "next-auth";
import { summarizeForAgentAudit, writeAgentAuditEvent } from "@/lib/agent/audit";
import { recordAgentToolCallOrBlock } from "@/lib/agent/guardrails";
import { getServerAuthSession } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { getPlantByCode } from "@/lib/plant";
import { ALL_PLANTS_SCOPE, LAST_PLANT_COOKIE, normalizePlantCode } from "@/lib/plant-scope";

type SessionPlantRole = {
  plantId: string | null;
  plantCode: string | null;
  role: RoleCode;
};

export type AgentPendingConfirmationSummary = {
  confirmationId: string;
  toolName: string;
  summary: string;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "confirmed" | "cancelled" | "expired";
};

export type AgentToolContext = {
  session: Session & {
    user: Session["user"] & {
      id: string;
      plantRoles: SessionPlantRole[];
    };
  };
  userId: string;
  plantId: string;
  plantCode: string;
  role: RoleCode;
  requestId?: string;
  guardrails?: {
    maxToolCalls: number;
    toolCallCount: number;
    toolCallLimitExceeded?: boolean;
    abortController?: AbortController;
  };
  pendingConfirmation?: AgentPendingConfirmationSummary;
};

export const AGENT_COMMUNICATION_READ_ROLES = [
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
  RoleCode.N5_OPERATOR,
  RoleCode.N6_HR,
] as const;

export const AGENT_COMMUNICATION_WRITE_ROLES = [
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
  RoleCode.N5_OPERATOR,
] as const;

export const AGENT_ACTION_ROLES = [
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
  RoleCode.N5_OPERATOR,
] as const;

export const AGENT_CLOSE_ACTION_ROLES = [
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
] as const;

export const AGENT_CONTROLLED_OPERATION_ROLES = [
  RoleCode.N1_CORPORATE,
  RoleCode.N3_SAFETY,
] as const;

export const AGENT_SEWO_READ_ROLES = [
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
] as const;

export const AGENT_MASTER_DATA_READ_ROLES = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
] as const;

export const AGENT_KPI_READ_ROLES = [
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
  RoleCode.N5_OPERATOR,
  RoleCode.N6_HR,
] as const;

export type AgentToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; errorCode: string; message: string };

export const AGENT_ACCESS_ROLES = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
] as const;

export const AGENT_RATE_LIMIT_EXEMPT_ROLES = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N3_SAFETY,
] as const;

export function canUseAgent(input: { role?: RoleCode | null }) {
  return Boolean(input.role && AGENT_ACCESS_ROLES.includes(input.role as (typeof AGENT_ACCESS_ROLES)[number]));
}

export function isAgentRateLimitExempt(input: { role?: RoleCode | null }) {
  return Boolean(
    input.role && AGENT_RATE_LIMIT_EXEMPT_ROLES.includes(input.role as (typeof AGENT_RATE_LIMIT_EXEMPT_ROLES)[number]),
  );
}

export class AgentToolUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentToolUserError";
  }
}

const INTERNAL_TOOL_ERROR_MESSAGE = "Nao foi possivel executar essa operacao do agente. Tente novamente mais tarde.";

function formatAgentToolError(error: unknown) {
  if (error instanceof AgentToolUserError) {
    return {
      errorCode: "AGENT_TOOL_USER_ERROR",
      message: error.message,
    };
  }

  return {
    errorCode: "AGENT_TOOL_ERROR",
    message: INTERNAL_TOOL_ERROR_MESSAGE,
  };
}

function resolveRequestedPlantCode(input: { plantCode?: string | null; cookiePlantCode?: string | null; roles: SessionPlantRole[] }) {
  const explicitCode = input.plantCode?.trim();
  if (explicitCode && explicitCode !== ALL_PLANTS_SCOPE) return normalizePlantCode(explicitCode);

  const cookieCode = input.cookiePlantCode?.trim();
  if (cookieCode && cookieCode !== ALL_PLANTS_SCOPE) return normalizePlantCode(cookieCode);

  return input.roles.find((entry) => entry.plantCode)?.plantCode ?? null;
}

function resolveRoleForPlant(roles: SessionPlantRole[], plantCode: string) {
  if (roles.some((entry) => entry.role === RoleCode.N0_ADMIN)) return RoleCode.N0_ADMIN;
  if (roles.some((entry) => entry.role === RoleCode.N1_CORPORATE)) return RoleCode.N1_CORPORATE;
  return roles.find((entry) => entry.plantCode === plantCode)?.role ?? null;
}

export async function resolveAgentToolContext(input: {
  plantCode?: string | null;
  cookiePlantCode?: string | null;
}) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return {
      ok: false as const,
      errorCode: "UNAUTHORIZED",
      message: "Authentication required",
      status: 401,
    };
  }

  const plantCode = resolveRequestedPlantCode({
    plantCode: input.plantCode,
    cookiePlantCode: input.cookiePlantCode,
    roles: session.user.plantRoles,
  });
  if (!plantCode) {
    return {
      ok: false as const,
      errorCode: "PLANT_REQUIRED",
      message: "Select a plant before using the agent.",
      status: 400,
    };
  }

  const role = resolveRoleForPlant(session.user.plantRoles, plantCode);
  if (!role) {
    return {
      ok: false as const,
      errorCode: "FORBIDDEN",
      message: "Insufficient role for plant scope",
      status: 403,
    };
  }

  const plant = await getPlantByCode(plantCode);
  const context: AgentToolContext = {
    session: session as AgentToolContext["session"],
    userId: session.user.id,
    plantId: plant.id,
    plantCode: plant.code,
    role,
  };

  return {
    ok: true as const,
    context,
  };
}

export function getAgentCookiePlantCode(cookieStore: { get(name: string): { value: string } | undefined }) {
  return cookieStore.get(LAST_PLANT_COOKIE)?.value ?? null;
}

export function hasAgentPermission(ctx: AgentToolContext, allowedRoles: readonly RoleCode[]) {
  if (ctx.role === RoleCode.N0_ADMIN) return true;
  if (ctx.role === RoleCode.N1_CORPORATE && allowedRoles.some((role) => role !== RoleCode.N0_ADMIN)) return true;
  return allowedRoles.includes(ctx.role);
}

export function summarizeForAgentLog(value: unknown, depth = 0): unknown {
  return summarizeForAgentAudit(value, depth);
}

async function writeAgentToolAudit(input: {
  ctx: AgentToolContext;
  toolName: string;
  toolInput: unknown;
  result: unknown;
  status: "success" | "blocked" | "error";
}) {
  const eventType =
    input.status === "success" ? "tool_succeeded" : input.status === "blocked" ? "tool_blocked_rbac" : "tool_error";

  await writeAgentAuditEvent({
    ctx: input.ctx,
    eventType,
    result: input.status,
    toolName: input.toolName,
    input: input.toolInput,
    outputSummary: input.result,
  });
}

export async function runAgentTool<T>(input: {
  ctx: AgentToolContext;
  toolName: string;
  toolInput: unknown;
  allowedRoles: readonly RoleCode[];
  run: () => Promise<T>;
}): Promise<AgentToolResult<T>> {
  const guardrail = await recordAgentToolCallOrBlock(input.ctx);
  if (!guardrail.allowed) {
    const result = {
      errorCode: "AGENT_MAX_TOOL_CALLS_EXCEEDED",
      message: guardrail.error.message,
    };
    await writeAgentToolAudit({
      ctx: input.ctx,
      toolName: input.toolName,
      toolInput: input.toolInput,
      result,
      status: "blocked",
    });
    throw guardrail.error;
  }

  await writeAgentAuditEvent({
    ctx: input.ctx,
    eventType: "tool_called",
    result: "success",
    toolName: input.toolName,
    input: input.toolInput,
  });

  if (!hasAgentPermission(input.ctx, input.allowedRoles)) {
    const result = {
      errorCode: "FORBIDDEN",
      message: "You do not have permission to use this tool for the selected plant.",
    };
    await writeAgentToolAudit({
      ctx: input.ctx,
      toolName: input.toolName,
      toolInput: input.toolInput,
      result,
      status: "blocked",
    });
    return { ok: false, ...result };
  }

  try {
    const result = await input.run();
    await writeAgentToolAudit({
      ctx: input.ctx,
      toolName: input.toolName,
      toolInput: input.toolInput,
      result,
      status: "success",
    });
    return { ok: true, data: result };
  } catch (error) {
    if (!(error instanceof AgentToolUserError)) {
      logger.error(
        {
          error,
          userId: input.ctx.userId,
          plantCode: input.ctx.plantCode,
          toolName: input.toolName,
        },
        "agent_tool_unexpected_error",
      );
    }
    const result = formatAgentToolError(error);
    await writeAgentToolAudit({
      ctx: input.ctx,
      toolName: input.toolName,
      toolInput: input.toolInput,
      result,
      status: "error",
    });
    return { ok: false, ...result };
  }
}
