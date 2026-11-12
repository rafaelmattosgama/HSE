import { tool } from "@openai/agents";
import { z } from "zod";
import {
  AGENT_KPI_READ_ROLES,
  type AgentToolContext,
  runAgentTool,
} from "@/lib/agent/permissions";
import { KpiService } from "@/lib/services/kpi-service";

const monthlyKpiInput = z.object({
  year: z.number().int().min(2000).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
});

export function createKpiTools(ctx: AgentToolContext) {
  return [
    tool({
      name: "get_monthly_kpis",
      description: "Get monthly HSE KPIs for the authenticated user's current plant. Defaults to the current month when year or month is omitted.",
      parameters: monthlyKpiInput,
      execute: async (input) =>
        runAgentTool({
          ctx,
          toolName: "get_monthly_kpis",
          toolInput: input,
          allowedRoles: AGENT_KPI_READ_ROLES,
          run: async () => {
            const now = new Date();
            return KpiService.getMonthlyKpis(
              ctx.plantId,
              input.year ?? now.getFullYear(),
              input.month ?? now.getMonth() + 1,
            );
          },
        }),
    }),
  ];
}
