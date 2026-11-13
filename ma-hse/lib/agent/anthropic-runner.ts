import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessageParam,
  BetaTool,
  BetaToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { RunContext, type FunctionTool, type Tool } from "@openai/agents";
import { AgentTooManyToolCallsError } from "@/lib/agent/guardrails";
import type { AgentToolContext } from "@/lib/agent/permissions";

/**
 * Runs the internal HSE agent on Claude (Anthropic API).
 *
 * The tools are the same objects built for the OpenAI Agents SDK
 * (lib/agent/tools/*). Each tool's invoke() still validates its input with Zod
 * and runs through runAgentTool, so role checks, plant scoping, tool-call
 * limits, server-side confirmations and audit logging are unchanged. Only the
 * model conversation loop is provided here.
 */

export type AnthropicAgentRunInput = {
  ctx: AgentToolContext;
  instructions: string;
  tools: Tool<AgentToolContext>[];
  message: string;
  model: string;
  apiKey: string;
  maxTurns: number;
  signal: AbortSignal;
  maxTokens?: number;
};

export type AnthropicAgentRunResult = {
  finalOutput: string;
  turns: number;
};

function isFunctionTool(tool: Tool<AgentToolContext>): tool is FunctionTool<AgentToolContext> {
  return tool.type === "function";
}

function toAnthropicTool(tool: FunctionTool<AgentToolContext>): BetaTool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as BetaTool["input_schema"],
  };
}

function stringifyToolOutput(output: unknown) {
  if (typeof output === "string") return output;
  try {
    return JSON.stringify(output) ?? "";
  } catch {
    return String(output);
  }
}

function throwIfAborted(signal: AbortSignal) {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new Error("AGENT_REQUEST_TIMEOUT");
}

function collectText(content: Anthropic.Beta.BetaContentBlock[]) {
  return content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export async function runAgentWithAnthropic(input: AnthropicAgentRunInput): Promise<AnthropicAgentRunResult> {
  const functionTools = input.tools.filter(isFunctionTool);
  const toolsByName = new Map(functionTools.map((tool) => [tool.name, tool]));
  const runContext = new RunContext<AgentToolContext>(input.ctx);
  const client = new Anthropic({ apiKey: input.apiKey, maxRetries: 1 });

  const messages: BetaMessageParam[] = [{ role: "user", content: input.message }];

  for (let turn = 1; turn <= input.maxTurns; turn += 1) {
    throwIfAborted(input.signal);

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create(
        {
          model: input.model,
          max_tokens: input.maxTokens ?? 16_000,
          // Server-side fallback: on a refusal the API retries on a fallback
          // model chosen by refusal category, inside the same call.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          // Interactive chat with a request timeout: keep thinking moderate.
          output_config: { effort: "medium" },
          system: input.instructions,
          ...(functionTools.length ? { tools: functionTools.map(toAnthropicTool) } : {}),
          messages,
        },
        { signal: input.signal },
      );
    } catch (error) {
      // The guardrails abort the shared controller with a typed reason
      // (tool-call limit or timeout); surface that reason, not the SDK error.
      throwIfAborted(input.signal);
      throw error;
    }

    if (response.stop_reason !== "tool_use") {
      const text = collectText(response.content);
      if (response.stop_reason === "refusal" && !text) {
        throw new Error("AGENT_MODEL_REFUSAL");
      }
      return { finalOutput: text, turns: turn };
    }

    // Keep the full assistant content (including thinking blocks) in history.
    messages.push({ role: "assistant", content: response.content as BetaContentBlockParam[] });

    const toolResults: BetaToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      const tool = toolsByName.get(block.name);
      if (!tool) {
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Unknown tool: ${block.name}`, is_error: true });
        continue;
      }
      try {
        const output = await tool.invoke(runContext, JSON.stringify(block.input ?? {}));
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: stringifyToolOutput(output) });
      } catch (error) {
        throwIfAborted(input.signal);
        if (error instanceof AgentTooManyToolCallsError) throw error;
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: "The tool failed. Do not retry with the same input; explain the problem to the user.",
          is_error: true,
        });
      }
      if (input.ctx.guardrails?.toolCallLimitExceeded) {
        throw new AgentTooManyToolCallsError(input.ctx.guardrails.maxToolCalls);
      }
    }

    // All tool results go back in a single user message.
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error("AGENT_MAX_TOOL_CALLS_EXCEEDED: max turns reached");
}
