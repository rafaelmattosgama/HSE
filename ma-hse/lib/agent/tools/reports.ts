import { RoleCode } from "@prisma/client";
import { tool } from "@openai/agents";
import { z } from "zod";
import { AgentToolUserError, type AgentToolContext, runAgentTool } from "@/lib/agent/permissions";
import { ReportService } from "@/lib/services/report-service";

const AGENT_REPORT_ROLES = [RoleCode.N1_CORPORATE] as const;
const MAX_REPORT_PERIOD_DAYS = 366;

const generatePeriodReportInput = z
  .object({
    reportType: z.enum(["MONTHLY", "ANNUAL", "WEEKLY_DIGEST"]).default("MONTHLY"),
    periodStart: z.string().min(1).optional(),
    periodEnd: z.string().min(1).optional(),
  })
  .passthrough();

const generatePeriodReportAllowedKeys = new Set(["reportType", "periodStart", "periodEnd"]);

function assertAllowedKeys(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  const unexpected = Object.keys(input as Record<string, unknown>).filter((key) => !generatePeriodReportAllowedKeys.has(key));
  if (unexpected.length > 0) throw new AgentToolUserError("Pedido invalido para gerar relatorio.");
}

function currentMonthPeriod(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    periodStart: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
    periodEnd: new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)),
  };
}

function parseDateAtStart(value: string) {
  const parsed = new Date(value.includes("T") ? value : `${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateAtEnd(value: string) {
  const parsed = new Date(value.includes("T") ? value : `${value}T23:59:59.999Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveReportPeriod(input: z.infer<typeof generatePeriodReportInput>) {
  if (!input.periodStart && !input.periodEnd) return currentMonthPeriod();
  if (!input.periodStart || !input.periodEnd) {
    throw new AgentToolUserError("Indica data inicial e data final para gerar o relatorio.");
  }

  const periodStart = parseDateAtStart(input.periodStart);
  const periodEnd = parseDateAtEnd(input.periodEnd);
  if (!periodStart || !periodEnd || periodStart > periodEnd) {
    throw new AgentToolUserError("Periodo invalido para gerar o relatorio.");
  }

  const periodDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86_400_000);
  if (periodDays > MAX_REPORT_PERIOD_DAYS) {
    throw new AgentToolUserError("O periodo maximo permitido para o relatorio e de 366 dias.");
  }

  return { periodStart, periodEnd };
}

export function createReportTools(ctx: AgentToolContext) {
  return [
    tool({
      name: "generate_period_report",
      description:
        "Generate a plant-scoped period report for the authenticated user's current plant. Returns metadata only, never raw files or buffers.",
      parameters: generatePeriodReportInput,
      execute: async (input) =>
        runAgentTool({
          ctx,
          toolName: "generate_period_report",
          toolInput: input,
          allowedRoles: AGENT_REPORT_ROLES,
          run: async () => {
            assertAllowedKeys(input);
            const parsed = generatePeriodReportInput.safeParse(input);
            if (!parsed.success) {
              throw new AgentToolUserError("Pedido invalido para gerar relatorio.");
            }

            const { periodStart, periodEnd } = resolveReportPeriod(parsed.data);
            const report = await ReportService.generateCorporatePeriodReport({
              reportType: parsed.data.reportType,
              periodStart,
              periodEnd,
              plantId: ctx.plantId,
            });

            return {
              title: report.title,
              plantCode: ctx.plantCode,
              reportType: report.meta.reportType,
              scope: report.meta.scope,
              periodStart: report.meta.periodStart,
              periodEnd: report.meta.periodEnd,
              fileName: report.files.pdf,
              storageKey: report.storageKeys.pdfKey,
            };
          },
        }),
    }),
  ];
}
