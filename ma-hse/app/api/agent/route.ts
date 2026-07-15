import { cookies } from "next/headers";
import { run } from "@openai/agents";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { buildAgentRequestSummary, createAgentRequestId, writeAgentAuditEvent } from "@/lib/agent/audit";
import { cancelPendingConfirmation, executePendingConfirmation } from "@/lib/agent/confirmations";
import { createInternalHseAgent } from "@/lib/agent/agent";
import {
  classifyAgentRunError,
  configureAgentExecutionGuardrails,
  createAgentTimeoutController,
  truncateAgentOutput,
} from "@/lib/agent/guardrails";
import { runMockAgent } from "@/lib/agent/mock-agent";
import { canUseAgent, getAgentCookiePlantCode, resolveAgentToolContext } from "@/lib/agent/permissions";
import { enforceAgentRateLimit } from "@/lib/agent/rate-limit";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const AGENT_UNAVAILABLE_MESSAGE = "O agente interno esta temporariamente indisponivel. Tente novamente mais tarde.";
const AGENT_NOT_CONFIGURED_MESSAGE = "O agente interno ainda nao esta configurado neste ambiente.";
const AGENT_DISABLED_MESSAGE = "O agente interno nao esta disponivel neste ambiente.";
const AGENT_FORBIDDEN_MESSAGE = "Nao tem permissao para usar o agente interno nesta planta.";
const AGENT_MESSAGE_TOO_LONG_MESSAGE = "A mensagem e demasiado longa. Reduz o texto e tenta novamente.";
const INVALID_AGENT_REQUEST_MESSAGE = "Pedido invalido para o agente.";

const agentRequestInput = z
  .object({
    message: z
      .string()
      .trim()
      .min(1, { message: INVALID_AGENT_REQUEST_MESSAGE })
      .max(env.AGENT_MAX_MESSAGE_CHARS, { message: AGENT_MESSAGE_TOO_LONG_MESSAGE })
      .optional(),
    plantCode: z.string().trim().min(2).max(40).optional(),
    confirmationId: z.string().uuid().optional(),
    confirmationAction: z.enum(["confirm", "cancel"]).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.message && !value.confirmationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide a message or confirmationId.",
        path: ["message"],
      });
    }

    if (value.confirmationId && !value.confirmationAction) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "confirmationAction is required when confirmationId is provided.",
        path: ["confirmationAction"],
      });
    }
  });

async function resolveContext(plantCode?: string | null) {
  const cookieStore = await cookies();
  return resolveAgentToolContext({
    plantCode,
    cookiePlantCode: getAgentCookiePlantCode(cookieStore),
  });
}

function getAgentInputErrorMessage(error: z.ZodError) {
  if (error.issues.some((issue) => issue.message === AGENT_MESSAGE_TOO_LONG_MESSAGE)) {
    return AGENT_MESSAGE_TOO_LONG_MESSAGE;
  }

  return INVALID_AGENT_REQUEST_MESSAGE;
}

export async function POST(request: Request) {
  const requestId = createAgentRequestId();
  await writeAgentAuditEvent({
    requestId,
    eventType: "request_received",
    result: "success",
  });

  if (!env.AGENT_ENABLED) {
    await writeAgentAuditEvent({
      requestId,
      eventType: "agent_disabled",
      result: "blocked",
      errorCode: "AGENT_DISABLED",
      status: 404,
    });
    return fail("AGENT_DISABLED", AGENT_DISABLED_MESSAGE, 404);
  }

  const body = await request.json().catch(() => null);
  const parsed = agentRequestInput.safeParse(body);
  if (!parsed.success) {
    const message = getAgentInputErrorMessage(parsed.error);
    const requestSummary = buildAgentRequestSummary(body);
    await writeAgentAuditEvent({
      requestId,
      eventType: message === AGENT_MESSAGE_TOO_LONG_MESSAGE ? "message_too_large" : "agent_error",
      result: "blocked",
      errorCode: "INVALID_AGENT_REQUEST",
      status: 400,
      messageLength: typeof body === "object" && body && "message" in body && typeof body.message === "string" ? body.message.length : null,
      input: requestSummary,
    });
    return fail("INVALID_AGENT_REQUEST", message, 400);
  }

  const resolved = await resolveContext(parsed.data.plantCode);
  if (!resolved.ok) {
    await writeAgentAuditEvent({
      requestId,
      eventType: "agent_error",
      result: resolved.status === 401 || resolved.status === 403 ? "blocked" : "error",
      errorCode: resolved.errorCode,
      status: resolved.status,
      messageLength: parsed.data.message?.length ?? null,
      input: buildAgentRequestSummary(parsed.data),
    });
    return fail(resolved.errorCode, resolved.message, resolved.status);
  }
  const ctx = resolved.context;
  ctx.requestId = requestId;

  if (!canUseAgent(ctx)) {
    await writeAgentAuditEvent({
      ctx,
      eventType: "agent_error",
      result: "blocked",
      errorCode: "AGENT_FORBIDDEN",
      status: 403,
      messageLength: parsed.data.message?.length ?? null,
      input: buildAgentRequestSummary(parsed.data),
    });
    return fail("AGENT_FORBIDDEN", AGENT_FORBIDDEN_MESSAGE, 403);
  }

  const rateLimit = await enforceAgentRateLimit(ctx);
  if (!rateLimit.allowed) {
    await writeAgentAuditEvent({
      ctx,
      eventType: "rate_limited",
      result: "blocked",
      errorCode: rateLimit.errorCode,
      status: rateLimit.status,
      messageLength: parsed.data.message?.length ?? null,
      input: buildAgentRequestSummary(parsed.data),
    });
    return fail(rateLimit.errorCode, rateLimit.message, rateLimit.status);
  }

  if (parsed.data.confirmationId) {
    if (parsed.data.confirmationAction === "cancel") {
      const cancelled = await cancelPendingConfirmation({
        ctx,
        confirmationId: parsed.data.confirmationId,
      });
      if (!cancelled.ok) {
        await writeAgentAuditEvent({
          ctx,
          eventType: "agent_error",
          result: cancelled.status === 500 ? "error" : "blocked",
          confirmationId: parsed.data.confirmationId,
          errorCode: cancelled.errorCode,
          status: cancelled.status,
        });
        return fail(cancelled.errorCode, cancelled.message, cancelled.status);
      }
      await writeAgentAuditEvent({
        ctx,
        eventType: "agent_response",
        result: "success",
        confirmationId: parsed.data.confirmationId,
        outputSummary: { type: "confirmation_cancelled" },
      });
      return ok({
        type: "confirmation_cancelled",
        plantCode: ctx.plantCode,
        ...cancelled.data,
      });
    }

    const executed = await executePendingConfirmation({
      ctx,
      confirmationId: parsed.data.confirmationId,
    });
    if (!executed.ok) {
      await writeAgentAuditEvent({
        ctx,
        eventType: "agent_error",
        result: executed.status === 500 ? "error" : "blocked",
        confirmationId: parsed.data.confirmationId,
        errorCode: executed.errorCode,
        status: executed.status,
      });
      return fail(executed.errorCode, executed.message, executed.status);
    }
    await writeAgentAuditEvent({
      ctx,
      eventType: "agent_response",
      result: "success",
      confirmationId: parsed.data.confirmationId,
      outputSummary: { type: "confirmation_executed", toolName: executed.data.toolName },
    });
    return ok({
      type: "confirmation_executed",
      plantCode: ctx.plantCode,
      ...executed.data,
    });
  }

  if (env.AGENT_MOCK_MODE) {
    try {
      const result = await runMockAgent(ctx, parsed.data.message!);
      await writeAgentAuditEvent({
        ctx,
        eventType: "agent_response",
        result: "success",
        mode: "mock",
        messageLength: parsed.data.message!.length,
        outputSummary: {
          responseLength: result.message.length,
          hasConfirmation: Boolean(result.confirmation ?? ctx.pendingConfirmation),
          confirmationId: (result.confirmation ?? ctx.pendingConfirmation)?.confirmationId ?? null,
        },
      });
      return ok({
        type: "agent_response",
        plantCode: ctx.plantCode,
        message: result.message,
        confirmation: result.confirmation ?? ctx.pendingConfirmation ?? null,
      });
    } catch (error) {
      logger.error(
        {
          error,
          userId: ctx.userId,
          plantCode: ctx.plantCode,
        },
        "agent_mock_run_failed",
      );
      await writeAgentAuditEvent({
        ctx,
        eventType: "agent_error",
        result: "error",
        mode: "mock",
        errorCode: "AGENT_MOCK_RUN_FAILED",
        status: 500,
        messageLength: parsed.data.message!.length,
      });
      return fail("AGENT_MOCK_RUN_FAILED", AGENT_UNAVAILABLE_MESSAGE, 500);
    }
  }

  if (!env.OPENAI_API_KEY) {
    await writeAgentAuditEvent({
      ctx,
      eventType: "agent_error",
      result: "blocked",
      mode: "real",
      errorCode: "AGENT_NOT_CONFIGURED",
      status: 503,
      messageLength: parsed.data.message!.length,
    });
    return fail("AGENT_NOT_CONFIGURED", AGENT_NOT_CONFIGURED_MESSAGE, 503);
  }

  try {
    const timeout = createAgentTimeoutController(env.AGENT_REQUEST_TIMEOUT_MS);
    configureAgentExecutionGuardrails(ctx, {
      maxToolCalls: env.AGENT_MAX_TOOL_CALLS,
      abortController: timeout.controller,
    });
    const agent = createInternalHseAgent(ctx);
    let finalOutput = "";
    try {
      const result = await run(agent, parsed.data.message!, {
        context: ctx,
        maxTurns: env.AGENT_MAX_TOOL_CALLS + 2,
        signal: timeout.signal,
      });
      finalOutput = String(result.finalOutput ?? "");
    } finally {
      timeout.clear();
    }
    if (ctx.guardrails?.toolCallLimitExceeded) {
      throw new Error("AGENT_MAX_TOOL_CALLS_EXCEEDED");
    }
    const output = truncateAgentOutput(finalOutput, env.AGENT_MAX_OUTPUT_CHARS);

    if (output.truncated) {
      await writeAgentAuditEvent({
        ctx,
        eventType: "agent_output_truncated",
        result: "success",
        mode: "real",
        messageLength: parsed.data.message!.length,
        outputSummary: {
          originalLength: output.originalLength,
          maxOutputChars: env.AGENT_MAX_OUTPUT_CHARS,
        },
      });
    }

    await writeAgentAuditEvent({
      ctx,
      eventType: "agent_response",
      result: "success",
      mode: "real",
      messageLength: parsed.data.message!.length,
      outputSummary: {
        responseLength: output.output.length,
        originalResponseLength: output.originalLength,
        truncated: output.truncated,
        hasConfirmation: Boolean(ctx.pendingConfirmation),
        confirmationId: ctx.pendingConfirmation?.confirmationId ?? null,
        toolCallCount: ctx.guardrails?.toolCallCount ?? null,
        maxToolCalls: ctx.guardrails?.maxToolCalls ?? null,
      },
    });

    return ok({
      type: "agent_response",
      plantCode: ctx.plantCode,
      message: output.output,
      confirmation: ctx.pendingConfirmation ?? null,
    });
  } catch (error) {
    const safeError = classifyAgentRunError(error);
    logger.error(
      {
        error,
        userId: ctx.userId,
        plantCode: ctx.plantCode,
      },
      "agent_run_failed",
      );
    await writeAgentAuditEvent({
      ctx,
      eventType:
        safeError.kind === "timeout"
          ? "agent_timeout"
          : safeError.kind === "too_many_tool_calls"
            ? "tool_call_limit_exceeded"
            : safeError.kind === "openai_quota"
              ? "openai_quota_error"
              : safeError.kind === "openai_auth"
                ? "openai_auth_error"
                : "agent_error",
      result: "error",
      mode: "real",
      errorCode: safeError.errorCode,
      status: safeError.status,
      messageLength: parsed.data.message!.length,
      outputSummary: {
        toolCallCount: ctx.guardrails?.toolCallCount ?? null,
        maxToolCalls: ctx.guardrails?.maxToolCalls ?? null,
      },
    });
    return fail(safeError.errorCode, safeError.message, safeError.status);
  }
}
