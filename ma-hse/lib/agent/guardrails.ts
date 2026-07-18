import { writeAgentAuditEvent } from "@/lib/agent/audit";
import type { AgentToolContext } from "@/lib/agent/permissions";

export const AGENT_TIMEOUT_MESSAGE = "O agente demorou demasiado a responder. Tenta novamente.";
export const AGENT_TOO_MANY_TOOL_CALLS_MESSAGE =
  "O agente precisou de demasiadas operacoes para concluir este pedido. Tenta reformular.";
export const AGENT_OPENAI_QUOTA_MESSAGE = "A conta OpenAI API nao tem quota ou billing disponivel.";
export const AGENT_OPENAI_AUTH_MESSAGE = "Nao foi possivel autenticar o agente OpenAI neste ambiente.";
export const AGENT_GENERIC_RUN_MESSAGE = "Nao foi possivel processar o pedido do agente.";

export class AgentTooManyToolCallsError extends Error {
  constructor(readonly maxToolCalls: number) {
    super(AGENT_TOO_MANY_TOOL_CALLS_MESSAGE);
    this.name = "AgentTooManyToolCallsError";
  }
}

export type AgentRunErrorKind = "timeout" | "too_many_tool_calls" | "openai_quota" | "openai_auth" | "generic";

export function configureAgentExecutionGuardrails(
  ctx: AgentToolContext,
  input: { maxToolCalls: number; abortController?: AbortController },
) {
  ctx.guardrails = {
    maxToolCalls: input.maxToolCalls,
    toolCallCount: 0,
    toolCallLimitExceeded: false,
    abortController: input.abortController,
  };
}

export async function recordAgentToolCallOrBlock(ctx: AgentToolContext) {
  if (!ctx.guardrails) return { allowed: true as const, count: null };

  ctx.guardrails.toolCallCount += 1;
  const count = ctx.guardrails.toolCallCount;
  if (count <= ctx.guardrails.maxToolCalls) {
    return { allowed: true as const, count };
  }

  await writeAgentAuditEvent({
    ctx,
    eventType: "tool_call_limit_exceeded",
    result: "blocked",
    errorCode: "AGENT_MAX_TOOL_CALLS_EXCEEDED",
    status: 429,
    outputSummary: {
      toolCallCount: count,
      maxToolCalls: ctx.guardrails.maxToolCalls,
    },
  });
  ctx.guardrails.toolCallLimitExceeded = true;
  ctx.guardrails.abortController?.abort(new AgentTooManyToolCallsError(ctx.guardrails.maxToolCalls));

  return {
    allowed: false as const,
    count,
    error: new AgentTooManyToolCallsError(ctx.guardrails.maxToolCalls),
  };
}

export function createAgentTimeoutController(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error("AGENT_REQUEST_TIMEOUT"));
  }, timeoutMs);

  return {
    controller,
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

function getErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const record = error as Record<string, unknown>;
  const status = record.status ?? record.statusCode ?? record.code;
  return typeof status === "number" || typeof status === "string" ? String(status) : null;
}

function getErrorText(error: unknown) {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (!error || typeof error !== "object") return String(error);
  const record = error as Record<string, unknown>;
  return [record.name, record.message, record.type, record.code, record.status, record.statusCode].filter(Boolean).join(" ");
}

export function classifyAgentRunError(error: unknown): {
  kind: AgentRunErrorKind;
  errorCode: string;
  message: string;
  status: number;
} {
  const status = getErrorStatus(error);
  const text = getErrorText(error).toLowerCase();

  if (
    error instanceof AgentTooManyToolCallsError ||
    text.includes("max_tool_calls") ||
    text.includes("too many tool") ||
    text.includes("max turns")
  ) {
    return {
      kind: "too_many_tool_calls",
      errorCode: "AGENT_MAX_TOOL_CALLS_EXCEEDED",
      message: AGENT_TOO_MANY_TOOL_CALLS_MESSAGE,
      status: 429,
    };
  }

  if (text.includes("abort") || text.includes("timeout") || text.includes("timed out") || text.includes("agent_request_timeout")) {
    return {
      kind: "timeout",
      errorCode: "AGENT_TIMEOUT",
      message: AGENT_TIMEOUT_MESSAGE,
      status: 504,
    };
  }

  if (status === "429" || text.includes("quota") || text.includes("billing") || text.includes("rate limit")) {
    return {
      kind: "openai_quota",
      errorCode: "OPENAI_QUOTA_OR_RATE_LIMIT",
      message: AGENT_OPENAI_QUOTA_MESSAGE,
      status: 503,
    };
  }

  if (status === "401" || status === "403" || text.includes("api key") || text.includes("authentication") || text.includes("unauthorized")) {
    return {
      kind: "openai_auth",
      errorCode: "OPENAI_AUTH_ERROR",
      message: AGENT_OPENAI_AUTH_MESSAGE,
      status: 503,
    };
  }

  return {
    kind: "generic",
    errorCode: "AGENT_RUN_FAILED",
    message: AGENT_GENERIC_RUN_MESSAGE,
    status: 500,
  };
}

export function truncateAgentOutput(output: string, maxChars: number, truncatedMessage = "Resposta truncada por limite de seguranca. Reformule o pedido para obter uma resposta mais curta.") {
  if (output.length <= maxChars) {
    return {
      output,
      truncated: false,
      originalLength: output.length,
    };
  }

  const suffix = `\n\n[${truncatedMessage}]`;
  const sliceLength = Math.max(0, maxChars - suffix.length);
  return {
    output: `${output.slice(0, sliceLength)}${suffix}`,
    truncated: true,
    originalLength: output.length,
  };
}
