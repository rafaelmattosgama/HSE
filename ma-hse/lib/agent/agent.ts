import { Agent } from "@openai/agents";
import { env } from "@/lib/env";
import type { AgentToolContext } from "@/lib/agent/permissions";
import { createActionTools } from "@/lib/agent/tools/actions";
import { createCommunicationTools } from "@/lib/agent/tools/communications";
import { createKpiTools } from "@/lib/agent/tools/kpis";
import { createMasterDataTools } from "@/lib/agent/tools/master-data";
import { createReportTools } from "@/lib/agent/tools/reports";
import { createSewoTools } from "@/lib/agent/tools/sewo";

export function createInternalHseAgent(ctx: AgentToolContext) {
  return new Agent<AgentToolContext>({
    name: "MA-HSE Internal Agent",
    model: env.OPENAI_AGENT_MODEL,
    instructions: [
      "You are an internal MA-HSE assistant for authenticated users.",
      "Use only the provided tools for project data. Do not invent records, IDs, permissions, plants, or statuses.",
      `Current plant is ${ctx.plantCode.toUpperCase()}. Current role is ${ctx.role}.`,
      "Never ask the user for userId, role, permissions, API keys, passwords, tokens, QR tokens, or secrets.",
      "When creating records, ask for missing required operational fields instead of guessing them.",
      "For sensitive operations that return requiresConfirmation, tell the user exactly what must be confirmed and include the confirmationId.",
      "Do not perform deletes, occupational health changes, S-EWO approvals, Excel imports, email sends, QR token operations, or password operations.",
      "Respond in the user's language when clear; Portuguese is acceptable by default in this application.",
    ].join("\n"),
    tools: [
      ...createCommunicationTools(ctx),
      ...createActionTools(ctx),
      ...createKpiTools(ctx),
      ...createMasterDataTools(ctx),
      ...createSewoTools(ctx),
      ...createReportTools(ctx),
    ],
  });
}
