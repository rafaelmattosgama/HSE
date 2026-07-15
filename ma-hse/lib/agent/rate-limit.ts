import { consumeRateLimit } from "@/lib/rate-limit";
import type { AgentToolContext } from "@/lib/agent/permissions";
import { isAgentRateLimitExempt } from "@/lib/agent/permissions";
import { env } from "@/lib/env";

export const AGENT_RATE_LIMIT_MESSAGE = "Demasiados pedidos ao agente. Tenta novamente dentro de alguns segundos.";

export function buildAgentRateLimitKey(ctx: Pick<AgentToolContext, "userId" | "plantCode">) {
  return ["agent", ctx.userId, ctx.plantCode].join(":");
}

export async function enforceAgentRateLimit(ctx: AgentToolContext) {
  if (!env.AGENT_RATE_LIMIT_ENABLED || isAgentRateLimitExempt(ctx)) {
    return { allowed: true as const };
  }

  const result = await consumeRateLimit(
    buildAgentRateLimitKey(ctx),
    env.AGENT_RATE_LIMIT_MAX_REQUESTS,
    env.AGENT_RATE_LIMIT_WINDOW_SECONDS,
  );

  if (result.allowed) {
    return { allowed: true as const };
  }

  return {
    allowed: false as const,
    errorCode: "AGENT_RATE_LIMITED",
    message: AGENT_RATE_LIMIT_MESSAGE,
    status: 429,
  };
}
