import { ActionPriority, ActionStatus } from "@prisma/client";
import type { AgentPendingConfirmationSummary, AgentToolContext, AgentToolResult } from "@/lib/agent/permissions";
import { createActionTools, prepareCloseActionForAgent } from "@/lib/agent/tools/actions";
import { createCommunicationTools } from "@/lib/agent/tools/communications";
import { createKpiTools } from "@/lib/agent/tools/kpis";
import { createReportTools } from "@/lib/agent/tools/reports";
import { prisma } from "@/lib/prisma";

type InvokableTool = {
  name: string;
  invoke: (details: unknown, input: string) => Promise<unknown>;
};

export type MockAgentResult = {
  message: string;
  confirmation?: AgentPendingConfirmationSummary | null;
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getTool(tools: unknown[], name: string) {
  const tool = tools.find((entry) => (entry as { name?: string }).name === name) as InvokableTool | undefined;
  if (!tool) throw new Error(`Mock agent tool ${name} not found.`);
  return tool;
}

async function invokeTool<T>(tool: InvokableTool, input: unknown): Promise<AgentToolResult<T>> {
  const result = await tool.invoke(null, JSON.stringify(input));
  if (typeof result === "string") {
    try {
      return JSON.parse(result) as AgentToolResult<T>;
    } catch {
      return {
        ok: false as const,
        errorCode: "AGENT_MOCK_TOOL_RESULT_INVALID",
        message: "Nao foi possivel interpretar a resposta da tool em modo mock.",
      };
    }
  }

  return result as AgentToolResult<T>;
}

function formatToolFailure(result: AgentToolResult<unknown>) {
  return result.ok ? "Pedido concluido." : result.message;
}

function formatActionRows(rows: Array<{ id: string; sequenceNumber?: number | null; title: string; status: string; dueDate?: Date | string | null }>) {
  if (rows.length === 0) return "Nao encontrei acoes abertas nesta planta.";

  return [
    `Encontrei ${rows.length} acao(oes) aberta(s) nesta planta:`,
    ...rows.slice(0, 10).map((row) => {
      const code = row.sequenceNumber ? `#${row.sequenceNumber}` : row.id;
      const dueDate = row.dueDate ? `, prazo ${new Date(row.dueDate).toLocaleDateString("pt-PT")}` : "";
      return `- ${code}: ${row.title} (${row.status}${dueDate})`;
    }),
  ].join("\n");
}

function formatCommunicationRows(rows: Array<{ code?: string | null; id: string; type: string; status: string; description?: string | null }>) {
  if (rows.length === 0) return "Nao encontrei comunicacoes nesta planta.";

  return [
    `Encontrei ${rows.length} comunicacao(oes) nesta planta:`,
    ...rows.slice(0, 10).map((row) => `- ${row.code ?? row.id}: ${row.type} (${row.status}) - ${row.description ?? "sem descricao"}`),
  ].join("\n");
}

function formatKpiResult(data: unknown) {
  if (!data || typeof data !== "object") return "KPIs obtidos para esta planta.";
  return `KPIs obtidos para esta planta:\n${JSON.stringify(data, null, 2).slice(0, 1800)}`;
}

function formatOverdueActionRows(data: {
  count: number;
  actions: Array<{ id: string; sequenceNumber?: number | null; title: string; priority: string; status: string; dueDate?: Date | string | null }>;
}) {
  if (data.count === 0) return "Nao encontrei acoes em atraso nesta planta.";

  return [
    `Encontrei ${data.count} acao(oes) em atraso nesta planta:`,
    ...data.actions.slice(0, 10).map((row) => {
      const code = row.sequenceNumber ? `#${row.sequenceNumber}` : row.id;
      const dueDate = row.dueDate ? `, prazo ${new Date(row.dueDate).toLocaleDateString("pt-PT")}` : "";
      return `- ${code}: ${row.title} (${row.priority}, ${row.status}${dueDate})`;
    }),
  ].join("\n");
}

function formatReportResult(data: { title?: string; fileName?: string; periodStart?: Date | string; periodEnd?: Date | string }) {
  const period =
    data.periodStart && data.periodEnd
      ? ` (${new Date(data.periodStart).toLocaleDateString("pt-PT")} a ${new Date(data.periodEnd).toLocaleDateString("pt-PT")})`
      : "";
  return `Relatorio gerado${period}: ${data.title ?? data.fileName ?? "metadata disponivel"}.`;
}

function extractActionReference(message: string) {
  const uuid = message.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)?.[0];
  if (uuid) return { id: uuid };

  const codeNumber = message.match(/\b(?:ACT|ACAO|AÇÃO|[A-Z]{2,10})[-\s#]*(\d{1,8})\b/i)?.[1];
  if (codeNumber) return { sequenceNumber: Number(codeNumber) };

  return null;
}

async function resolveActionIdForClose(ctx: AgentToolContext, message: string) {
  const reference = extractActionReference(message);
  if (!reference) return null;

  const action = await prisma.action.findFirst({
    where: {
      plantId: ctx.plantId,
      ...(reference.id ? { id: reference.id } : { sequenceNumber: reference.sequenceNumber }),
    },
    select: { id: true },
  });

  return action?.id ?? null;
}

function extractPriority(message: string) {
  const normalized = normalizeText(message);
  if (normalized.includes("alta") || normalized.includes("high")) return ActionPriority.HIGH;
  if (normalized.includes("media") || normalized.includes("medium")) return ActionPriority.MEDIUM;
  if (normalized.includes("baixa") || normalized.includes("low")) return ActionPriority.LOW;
  return null;
}

export async function runMockAgent(ctx: AgentToolContext, message: string): Promise<MockAgentResult> {
  const normalized = normalizeText(message);

  if (normalized.includes("atraso") || normalized.includes("overdue")) {
    const findOverdueActions = getTool(createActionTools(ctx), "find_overdue_actions");
    const result = await invokeTool<{
      count: number;
      actions: Array<{ id: string; sequenceNumber?: number | null; title: string; priority: string; status: string; dueDate?: Date | string | null }>;
    }>(findOverdueActions, { limit: 25 });

    return {
      message: result.ok ? formatOverdueActionRows(result.data) : result.message,
      confirmation: null,
    };
  }

  if ((normalized.includes("atualiza") || normalized.includes("actualiza") || normalized.includes("update")) && normalized.includes("acao")) {
    const actionId = await resolveActionIdForClose(ctx, message);
    const priority = extractPriority(message);
    if (!actionId || !priority) {
      return {
        message: "Indica a acao e a prioridade pretendida. Exemplo: atualiza a acao ACT-1 para prioridade alta.",
        confirmation: null,
      };
    }

    const updateAction = getTool(createActionTools(ctx), "update_action");
    const result = await invokeTool<{ id: string; sequenceNumber?: number | null; title: string; priority: string }>(updateAction, {
      actionId,
      priority,
    });

    return {
      message: result.ok
        ? `Acao atualizada: ${result.data.sequenceNumber ? `#${result.data.sequenceNumber}` : result.data.id} - ${result.data.title} (${result.data.priority}).`
        : result.message,
      confirmation: null,
    };
  }

  if (normalized.includes("relatorio") || normalized.includes("report")) {
    const generatePeriodReport = getTool(createReportTools(ctx), "generate_period_report");
    const result = await invokeTool<{
      title?: string;
      fileName?: string;
      periodStart?: Date | string;
      periodEnd?: Date | string;
    }>(generatePeriodReport, { reportType: "MONTHLY" });

    return {
      message: result.ok ? formatReportResult(result.data) : result.message,
      confirmation: null,
    };
  }

  if (normalized.includes("fecha") || normalized.includes("fechar") || normalized.includes("close")) {
    const actionId = await resolveActionIdForClose(ctx, message);
    if (!actionId) {
      return {
        message: "Indica o ID UUID da acao ou o numero/codigo da acao desta planta para eu preparar o fecho.",
        confirmation: null,
      };
    }

    const result = await prepareCloseActionForAgent(ctx, {
      actionId,
      closureComment: "Fecho preparado pelo agente mock/dev. Confirmacao explicita necessaria.",
      closedAt: new Date().toISOString(),
      evidence: [],
    });

    if (!result.ok) return { message: formatToolFailure(result), confirmation: null };

    return {
      message: ctx.pendingConfirmation?.summary ?? "Esta acao exige confirmacao antes de executar.",
      confirmation: ctx.pendingConfirmation ?? null,
    };
  }

  if (normalized.includes("lista") && normalized.includes("comunic")) {
    const listCommunications = getTool(createCommunicationTools(ctx), "list_communications");
    const result = await invokeTool<Array<{ code?: string | null; id: string; type: string; status: string; description?: string | null }>>(
      listCommunications,
      { limit: 25 },
    );

    return {
      message: result.ok ? formatCommunicationRows(result.data) : result.message,
      confirmation: null,
    };
  }

  if (normalized.includes("lista") && normalized.includes("aco")) {
    const listActions = getTool(createActionTools(ctx), "list_actions");
    const [openResult, ongoingResult] = await Promise.all([
      invokeTool<Array<{ id: string; sequenceNumber?: number | null; title: string; status: string; dueDate?: Date | string | null }>>(listActions, {
        status: ActionStatus.OPEN,
        limit: 25,
      }),
      invokeTool<Array<{ id: string; sequenceNumber?: number | null; title: string; status: string; dueDate?: Date | string | null }>>(listActions, {
        status: ActionStatus.ONGOING,
        limit: 25,
      }),
    ]);

    if (!openResult.ok) return { message: openResult.message, confirmation: null };
    if (!ongoingResult.ok) return { message: ongoingResult.message, confirmation: null };

    return {
      message: formatActionRows([...openResult.data, ...ongoingResult.data]),
      confirmation: null,
    };
  }

  if (normalized.includes("kpi")) {
    const now = new Date();
    const getKpis = getTool(createKpiTools(ctx), "get_monthly_kpis");
    const result = await invokeTool(getKpis, {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    });

    return {
      message: result.ok ? formatKpiResult(result.data) : result.message,
      confirmation: null,
    };
  }

  return {
    message:
      "Modo mock/dev ativo. Comandos suportados: lista acoes abertas, acoes em atraso, lista comunicacoes, kpis, atualiza a acao <id ou codigo> para prioridade alta/media/baixa, gera relatorio do mes atual, fecha a acao <id ou codigo>.",
    confirmation: null,
  };
}
