import { ActionPriority, ActionStatus } from "@prisma/client";
import { formatInternalAgentCopy, getInternalAgentCopy, type InternalAgentCopy } from "@/lib/agent/i18n";
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

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
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

function formatToolFailure(result: AgentToolResult<unknown>, copy: InternalAgentCopy) {
  return result.ok ? copy.ui.completed : copy.mock.operationFailed;
}

function formatActionRows(
  rows: Array<{ id: string; sequenceNumber?: number | null; title: string; status: string; dueDate?: Date | string | null }>,
  copy: InternalAgentCopy,
) {
  if (rows.length === 0) return copy.mock.noOpenActions;

  return [
    formatInternalAgentCopy(copy.mock.openActionsFound, { count: rows.length }),
    ...rows.slice(0, 10).map((row) => {
      const code = row.sequenceNumber ? `#${row.sequenceNumber}` : row.id;
      const dueDate = row.dueDate
        ? `, ${formatInternalAgentCopy(copy.mock.dueDate, { date: new Date(row.dueDate).toLocaleDateString(copy.locale) })}`
        : "";
      return `- ${code}: ${row.title} (${row.status}${dueDate})`;
    }),
  ].join("\n");
}

function formatCommunicationRows(
  rows: Array<{ code?: string | null; id: string; type: string; status: string; description?: string | null }>,
  copy: InternalAgentCopy,
) {
  if (rows.length === 0) return copy.mock.noCommunications;

  return [
    formatInternalAgentCopy(copy.mock.communicationsFound, { count: rows.length }),
    ...rows.slice(0, 10).map((row) => `- ${row.code ?? row.id}: ${row.type} (${row.status}) - ${row.description ?? copy.mock.noDescription}`),
  ].join("\n");
}

function formatKpiResult(data: unknown, copy: InternalAgentCopy) {
  if (!data || typeof data !== "object") return copy.mock.kpisFound;
  return `${copy.mock.kpisFound}\n${JSON.stringify(data, null, 2).slice(0, 1800)}`;
}

function formatOverdueActionRows(data: {
  count: number;
  actions: Array<{ id: string; sequenceNumber?: number | null; title: string; priority: string; status: string; dueDate?: Date | string | null }>;
}, copy: InternalAgentCopy) {
  if (data.count === 0) return copy.mock.noOverdueActions;

  return [
    formatInternalAgentCopy(copy.mock.overdueActionsFound, { count: data.count }),
    ...data.actions.slice(0, 10).map((row) => {
      const code = row.sequenceNumber ? `#${row.sequenceNumber}` : row.id;
      const dueDate = row.dueDate
        ? `, ${formatInternalAgentCopy(copy.mock.dueDate, { date: new Date(row.dueDate).toLocaleDateString(copy.locale) })}`
        : "";
      return `- ${code}: ${row.title} (${row.priority}, ${row.status}${dueDate})`;
    }),
  ].join("\n");
}

function formatReportResult(
  data: { title?: string; fileName?: string; periodStart?: Date | string; periodEnd?: Date | string },
  copy: InternalAgentCopy,
) {
  const period =
    data.periodStart && data.periodEnd
      ? ` (${new Date(data.periodStart).toLocaleDateString(copy.locale)} – ${new Date(data.periodEnd).toLocaleDateString(copy.locale)})`
      : "";
  return formatInternalAgentCopy(copy.mock.reportGenerated, {
    period,
    title: data.title ?? data.fileName ?? copy.mock.metadataAvailable,
  });
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
  if (includesAny(normalized, ["alta", "high", "hoch", "wysok", "ridicat", "eleve"])) return ActionPriority.HIGH;
  if (includesAny(normalized, ["media", "medium", "mittel", "sred", "medie", "moyen"])) return ActionPriority.MEDIUM;
  if (includesAny(normalized, ["baixa", "bassa", "low", "niedrig", "nisk", "scazut", "faible"])) return ActionPriority.LOW;
  return null;
}

export async function runMockAgent(ctx: AgentToolContext, message: string): Promise<MockAgentResult> {
  const copy = getInternalAgentCopy(ctx.session.user.language);
  const normalized = normalizeText(message);
  const mentionsAction = includesAny(normalized, ["aco", "acao", "action", "azione", "dzialan", "massnahm", "actiune"]);
  const requestsList = includesAny(normalized, ["lista", "list", "elenca", "auflist", "afis", "affich"]);

  if (includesAny(normalized, ["atraso", "overdue", "scadut", "zalegl", "uberfall", "intarzi", "retard"])) {
    const findOverdueActions = getTool(createActionTools(ctx), "find_overdue_actions");
    const result = await invokeTool<{
      count: number;
      actions: Array<{ id: string; sequenceNumber?: number | null; title: string; priority: string; status: string; dueDate?: Date | string | null }>;
    }>(findOverdueActions, { limit: 25 });

    return {
      message: result.ok ? formatOverdueActionRows(result.data, copy) : copy.mock.operationFailed,
      confirmation: null,
    };
  }

  if (includesAny(normalized, ["atualiza", "actualiza", "update", "aggiorna", "aktualiz", "actualize", "mettre a jour"]) && mentionsAction) {
    const actionId = await resolveActionIdForClose(ctx, message);
    const priority = extractPriority(message);
    if (!actionId || !priority) {
      return {
        message: copy.mock.specifyActionPriority,
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
        ? formatInternalAgentCopy(copy.mock.actionUpdated, {
            reference: result.data.sequenceNumber ? `#${result.data.sequenceNumber}` : result.data.id,
            title: result.data.title,
            priority: result.data.priority,
          })
        : copy.mock.operationFailed,
      confirmation: null,
    };
  }

  if (includesAny(normalized, ["relatorio", "report", "rapporto", "raport", "bericht"])) {
    const generatePeriodReport = getTool(createReportTools(ctx), "generate_period_report");
    const result = await invokeTool<{
      title?: string;
      fileName?: string;
      periodStart?: Date | string;
      periodEnd?: Date | string;
    }>(generatePeriodReport, { reportType: "MONTHLY" });

    return {
      message: result.ok ? formatReportResult(result.data, copy) : copy.mock.operationFailed,
      confirmation: null,
    };
  }

  if (includesAny(normalized, ["fecha", "fechar", "close", "chiud", "zamkn", "schliess", "inchid", "fermer", "clotur"])) {
    const actionId = await resolveActionIdForClose(ctx, message);
    if (!actionId) {
      return {
        message: copy.mock.specifyActionToClose,
        confirmation: null,
      };
    }

    const result = await prepareCloseActionForAgent(ctx, {
      actionId,
      closureComment: copy.mock.closureComment,
      closedAt: new Date().toISOString(),
      evidence: [],
    });

    if (!result.ok) return { message: formatToolFailure(result, copy), confirmation: null };

    return {
      message: ctx.pendingConfirmation?.summary ?? copy.mock.confirmationRequired,
      confirmation: ctx.pendingConfirmation ?? null,
    };
  }

  if (requestsList && includesAny(normalized, ["comunic", "meldung", "zglosz"])) {
    const listCommunications = getTool(createCommunicationTools(ctx), "list_communications");
    const result = await invokeTool<Array<{ code?: string | null; id: string; type: string; status: string; description?: string | null }>>(
      listCommunications,
      { limit: 25 },
    );

    return {
      message: result.ok ? formatCommunicationRows(result.data, copy) : copy.mock.operationFailed,
      confirmation: null,
    };
  }

  if (requestsList && mentionsAction) {
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

    if (!openResult.ok) return { message: copy.mock.operationFailed, confirmation: null };
    if (!ongoingResult.ok) return { message: copy.mock.operationFailed, confirmation: null };

    return {
      message: formatActionRows([...openResult.data, ...ongoingResult.data], copy),
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
      message: result.ok ? formatKpiResult(result.data, copy) : copy.mock.operationFailed,
      confirmation: null,
    };
  }

  return {
    message: copy.mock.help,
    confirmation: null,
  };
}
