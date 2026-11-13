import { beforeEach, describe, expect, it, vi } from "vitest";
import { tool } from "@openai/agents";
import { z } from "zod";

const mocks = vi.hoisted(() => {
  const create = vi.fn();
  class MockAnthropic {
    beta = { messages: { create } };
  }
  return { create, MockAnthropic };
});

vi.mock("@anthropic-ai/sdk", () => ({ default: mocks.MockAnthropic }));
vi.mock("@/lib/agent/audit", () => ({ writeAgentAuditEvent: vi.fn() }));

import { runAgentWithAnthropic } from "@/lib/agent/anthropic-runner";
import { AgentTooManyToolCallsError, configureAgentExecutionGuardrails, recordAgentToolCallOrBlock } from "@/lib/agent/guardrails";
import type { AgentToolContext } from "@/lib/agent/permissions";

function makeCtx() {
  return { plantCode: "maap", plantId: "plant-1", role: "N3_SAFETY", userId: "user-1" } as unknown as AgentToolContext;
}

function makeTools(ctx: AgentToolContext, execute = vi.fn(async (input: { status: string }) => ({ items: [`action-${input.status}`] }))) {
  return {
    execute,
    tools: [
      tool({
        name: "list_actions",
        description: "List actions of the current plant.",
        parameters: z.object({ status: z.string() }),
        execute: async (input) => {
          const guard = await recordAgentToolCallOrBlock(ctx);
          if (!guard.allowed) throw guard.error;
          return execute(input);
        },
      }),
    ],
  };
}

function baseInput(ctx: AgentToolContext, tools: ReturnType<typeof makeTools>["tools"], signal = new AbortController().signal) {
  return {
    ctx,
    instructions: "You are an internal MA-HSE assistant.",
    tools,
    message: "Quais as acoes abertas?",
    model: "claude-sonnet-5-5",
    apiKey: "test-key",
    maxTurns: 4,
    signal,
  };
}

describe("runAgentWithAnthropic", () => {
  beforeEach(() => {
    mocks.create.mockReset();
  });

  it("runs the existing tools and returns Claude's final answer", async () => {
    const ctx = makeCtx();
    const { tools, execute } = makeTools(ctx);
    mocks.create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "tu_1", name: "list_actions", input: { status: "OPEN" } }],
      })
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "Tem 1 acao aberta." }] });

    const result = await runAgentWithAnthropic(baseInput(ctx, tools));

    expect(result).toEqual({ finalOutput: "Tem 1 acao aberta.", turns: 2 });
    expect(execute).toHaveBeenCalledWith({ status: "OPEN" });

    const firstRequest = mocks.create.mock.calls[0][0];
    expect(firstRequest.model).toBe("claude-sonnet-5-5");
    expect(firstRequest.system).toContain("MA-HSE");
    expect(firstRequest.tools[0]).toMatchObject({ name: "list_actions", input_schema: { type: "object" } });

    const secondRequest = mocks.create.mock.calls[1][0];
    const toolResultMessage = secondRequest.messages.at(-1);
    expect(toolResultMessage.role).toBe("user");
    expect(toolResultMessage.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "tu_1" });
    expect(toolResultMessage.content[0].content).toContain("action-OPEN");
  });

  it("returns an error tool_result for unknown tools instead of failing", async () => {
    const ctx = makeCtx();
    const { tools } = makeTools(ctx);
    mocks.create
      .mockResolvedValueOnce({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu_x", name: "delete_everything", input: {} }] })
      .mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: "Nao posso fazer isso." }] });

    const result = await runAgentWithAnthropic(baseInput(ctx, tools));

    expect(result.finalOutput).toBe("Nao posso fazer isso.");
    const toolResult = mocks.create.mock.calls[1][0].messages.at(-1).content[0];
    expect(toolResult).toMatchObject({ tool_use_id: "tu_x", is_error: true });
  });

  it("stops when the existing tool-call guardrail is exceeded", async () => {
    const ctx = makeCtx();
    configureAgentExecutionGuardrails(ctx, { maxToolCalls: 1, abortController: new AbortController() });
    const { tools } = makeTools(ctx);
    mocks.create.mockResolvedValue({
      stop_reason: "tool_use",
      content: [
        { type: "tool_use", id: "tu_1", name: "list_actions", input: { status: "OPEN" } },
        { type: "tool_use", id: "tu_2", name: "list_actions", input: { status: "CLOSED" } },
      ],
    });

    await expect(runAgentWithAnthropic(baseInput(ctx, tools))).rejects.toBeInstanceOf(AgentTooManyToolCallsError);
  });

  it("fails when the turn limit is reached", async () => {
    const ctx = makeCtx();
    const { tools } = makeTools(ctx);
    mocks.create.mockResolvedValue({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "tu_1", name: "list_actions", input: { status: "OPEN" } }],
    });

    await expect(runAgentWithAnthropic({ ...baseInput(ctx, tools), maxTurns: 2 })).rejects.toThrow(/max turns/);
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  it("surfaces the timeout reason when the request is aborted", async () => {
    const ctx = makeCtx();
    const { tools } = makeTools(ctx);
    const controller = new AbortController();
    controller.abort(new Error("AGENT_REQUEST_TIMEOUT"));

    await expect(runAgentWithAnthropic(baseInput(ctx, tools, controller.signal))).rejects.toThrow("AGENT_REQUEST_TIMEOUT");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
