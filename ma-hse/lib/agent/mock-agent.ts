import { ActionPriority, ActionStatus } from "@prisma/client";
import { type AgentIntent, resolveAgentIntent } from "@/lib/agent/intents";
import { formatInternalAgentCopy, getInternalAgentCopy, type InternalAgentCopy } from "@/lib/agent/i18n";
import type { AgentPendingConfirmationSummary, AgentToolContext, AgentToolResult } from "@/lib/agent/permissions";
import {
  createActionTools,
  prepareCloseActionForAgent,
  prepareUpdateActionPriorityForAgent,
} from "@/lib/agent/tools/actions";
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
  flow?: AgentActionFlow | null;
};

export type AgentActionChoice = {
  id: string;
  url?: string;
  sequenceNumber?: number | null;
  title: string;
  status: string;
  priority: string;
  dueDate?: Date | string | null;
};

export type AgentActionFlow = {
  type: "update_priority" | "close_action";
  actions: AgentActionChoice[];
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

function extractPeriod(message: string): { dateFrom?: string; dateTo?: string } {
  const normalized = normalizeText(message);
  const isoRange = normalized.match(/entre\s+(\d{4}-\d{2}-\d{2})\s+e\s+(\d{4}-\d{2}-\d{2})/);
  if (isoRange) return { dateFrom: `${isoRange[1]}T00:00:00.000Z`, dateTo: `${isoRange[2]}T23:59:59.999Z` };
  const localRange = normalized.match(/entre\s+(\d{2})\/(\d{2})\/(\d{4})\s+e\s+(\d{2})\/(\d{2})\/(\d{4})/);
  if (localRange) {
    const [, fromDay, fromMonth, fromYear, toDay, toMonth, toYear] = localRange;
    return {
      dateFrom: new Date(Date.UTC(Number(fromYear), Number(fromMonth) - 1, Number(fromDay))).toISOString(),
      dateTo: new Date(Date.UTC(Number(toYear), Number(toMonth) - 1, Number(toDay), 23, 59, 59, 999)).toISOString(),
    };
  }
  const month = normalized.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (month) {
    const start = new Date(Date.UTC(Number(month[1]), Number(month[2]) - 1, 1));
    return { dateFrom: start.toISOString(), dateTo: new Date(Date.UTC(Number(month[1]), Number(month[2]), 0, 23, 59, 59, 999)).toISOString() };
  }
  const monthNames = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro", "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const monthIndex = monthNames.findIndex((name) => new RegExp(`\\b${name}\\b`).test(normalized)) % 12;
  if (monthIndex >= 0) {
    const year = Number(normalized.match(/\b(20\d{2})\b/)?.[1] ?? new Date().getUTCFullYear());
    const start = new Date(Date.UTC(year, monthIndex, 1));
    return { dateFrom: start.toISOString(), dateTo: new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999)).toISOString() };
  }
  const year = normalized.match(/\b(20\d{2})\b/);
  if (year) return { dateFrom: `${year[1]}-01-01T00:00:00.000Z`, dateTo: `${year[1]}-12-31T23:59:59.999Z` };
  const now = new Date();
  if (includesAny(normalized, ["este mes", "this month", "current month"])) {
    return { dateFrom: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(), dateTo: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)).toISOString() };
  }
  if (includesAny(normalized, ["mes passado", "last month", "previous month"])) {
    return { dateFrom: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString(), dateTo: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999)).toISOString() };
  }
  if (includesAny(normalized, ["ultimos 30 dias", "last 30 days", "past 30 days"])) {
    return { dateFrom: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), dateTo: now.toISOString() };
  }
  return {};
}

function captureFilter(message: string, pattern: RegExp) {
  const match = message.match(pattern);
  return match?.slice(1).find(Boolean)?.replace(/["'.,;]+$/g, "").trim() || undefined;
}

function extractCommunicationFilters(message: string) {
  const normalized = normalizeText(message);
  const status = includesAny(normalized, ["pendente", "por validar", "pending validation"]) ? "PENDING_VALIDATION"
    : includesAny(normalized, ["submetida", "submetidas", "submitted"]) ? "SUBMITTED"
      : includesAny(normalized, ["valida", "validadas", "validados", "valid open"]) ? "VALID_OPEN"
        : includesAny(normalized, ["em curso", "ongoing"]) ? "ONGOING"
          : includesAny(normalized, ["fechada", "fechadas", "fechado", "fechados", "closed"]) ? "CLOSED"
            : includesAny(normalized, ["rejeitada", "rejeitadas", "rejected"]) ? "REJECTED"
              : includesAny(normalized, ["invalida", "invalidas", "invalid"]) ? "INVALID" : undefined;
  const type = includesAny(normalized, ["quase acidente", "near miss"]) ? "NEAR_MISS"
    : includesAny(normalized, ["condicao perigosa", "unsafe condition"]) ? "UNSAFE_CONDITION"
      : includesAny(normalized, ["ato inseguro", "unsafe act"]) ? "UNSAFE_ACT"
        : includesAny(normalized, ["primeiros socorros", "first aid"]) ? "FIRST_AID"
          : includesAny(normalized, ["acidente", "accident"]) ? "ACCIDENT" : undefined;
  const areaName = captureFilter(message, /(?:departamento|área|area)\s+(?:de\s+)?(?:"([^"]+)"|'([^']+)'|(.+?))(?=\s+(?:em|no|na|entre|com|sobre)\b|[,;.]|$)/i);
  const workerSearch = captureFilter(message, /(?:trabalhador|colaborador|comunicante)\s+(?:chamado\s+|chamada\s+|de\s+|por\s+)?(?:"([^"]+)"|'([^']+)'|([\p{L}\d -]+?))(?=\s+(?:em|no|na|entre|do|da|com|sobre)\b|[,;.]|$)/iu);
  const explicitSearch = captureFilter(message, /(?:pesquisa(?:r)?\s+por|que\s+contenha|texto\s+"?)(?:\s+)?(?:"([^"]+)"|'([^']+)'|([\p{L}\d -]+?))(?=\s+(?:em|no|na|entre|do|da|com)\b|[,;.]|$)/iu);
  return { ...(status ? { status } : {}), ...(type ? { type } : {}), ...extractPeriod(message), ...(areaName ? { areaName } : {}), ...((workerSearch ?? explicitSearch) ? { search: workerSearch ?? explicitSearch } : {}) };
}

function extractActionFilters(message: string) {
  const normalized = normalizeText(message);
  const status = includesAny(normalized, ["aberta", "abertas", "open"]) ? "OPEN"
    : includesAny(normalized, ["em curso", "ongoing"]) ? "ONGOING"
      : includesAny(normalized, ["fechada", "fechadas", "fechado", "fechados", "closed"]) ? "CLOSED" : undefined;
  const priority = includesAny(normalized, ["prioridade alta", "alta prioridade", "high priority"]) ? "HIGH"
    : includesAny(normalized, ["prioridade media", "media prioridade", "medium priority"]) ? "MEDIUM"
      : includesAny(normalized, ["prioridade baixa", "baixa prioridade", "low priority"]) ? "LOW" : undefined;
  const ownerName = captureFilter(message, /(?:responsável|responsavel|atribuídas? a|atribuídos? a|atribuida a|atribuido a|owner)\s+(?:(?:a|ao|por)\s+)?(?:"([^"]+)"|'([^']+)'|([\p{L} -]+?))(?=\s+(?:em|no|na|entre|com|de)\b|[,;.]|$)/iu);
  const explicitSearch = captureFilter(message, /(?:pesquisa(?:r)? por|que contenha|com o texto)\s+(?:"([^"]+)"|'([^']+)'|([\p{L}\d -]+?))(?=\s+(?:em|no|na|entre|do|da)\b|[,;.]|$)/iu);
  const period = extractPeriod(message);
  return {
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(period.dateFrom ? { dueDateFrom: period.dateFrom } : {}),
    ...(period.dateTo ? { dueDateTo: period.dateTo } : {}),
    ...(ownerName ? { ownerName } : {}),
    ...(explicitSearch ? { search: explicitSearch } : {}),
  };
}

function extractOverdueActionFilters(message: string) {
  const { status: _status, ...filters } = extractActionFilters(message);
  return filters;
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

function formatToolFailure(
  result: AgentToolResult<unknown>,
  copy: InternalAgentCopy,
  operation?: "open" | "overdue" | "communications" | "kpis" | "report" | "close" | "priority",
) {
  if (result.ok) return copy.ui.completed;
  if (copy.locale === "pt") {
    if (result.errorCode === "FORBIDDEN") {
      return operation === "close"
        ? "Não tem permissão para fechar esta ação."
        : "Não tem permissão para efetuar esta operação.";
    }
    if (operation === "open") return "Não foi possível consultar as ações abertas. Tente novamente.";
    if (operation === "overdue") return "Não foi possível consultar as ações em atraso. Tente novamente.";
    if (operation === "communications") return "Não foi possível consultar as comunicações. Tente novamente.";
    if (operation === "kpis") return "Não foi possível obter os KPIs da fábrica. Tente novamente.";
    if (operation === "report") return "Não foi possível gerar o relatório. Tente novamente.";
    if (operation === "close") return "Não foi possível preparar o fecho desta ação. Tente novamente.";
    if (operation === "priority") return "Não foi possível atualizar a prioridade desta ação. Tente novamente.";
  }
  if (operation === "open") return "The open actions could not be retrieved. Please try again.";
  if (operation === "overdue") return "The overdue actions could not be retrieved. Please try again.";
  if (operation === "communications") return "The communications could not be retrieved. Please try again.";
  if (operation === "kpis") return "The plant KPIs could not be retrieved. Please try again.";
  if (operation === "report") return "The report could not be generated. Please try again.";
  return copy.mock.operationFailed;
}

function flowCopy(copy: InternalAgentCopy, key: "chooseAction" | "choosePriority") {
  if (copy.locale === "pt") {
    return key === "chooseAction"
      ? "Selecione primeiro uma ação."
      : "Selecione a nova prioridade para a ação.";
  }
  return key === "chooseAction" ? "Select an action first." : "Select the new priority for the action.";
}

async function listActionChoices(ctx: AgentToolContext, filters: Record<string, unknown> = {}): Promise<AgentToolResult<AgentActionChoice[]>> {
  const listActions = getTool(createActionTools(ctx), "list_actions");
  if (filters.status) {
    return invokeTool<AgentActionChoice[]>(listActions, { ...filters, limit: 50 });
  }
  const [openResult, ongoingResult] = await Promise.all([
    invokeTool<AgentActionChoice[]>(listActions, { ...filters, status: ActionStatus.OPEN, limit: 50 }),
    invokeTool<AgentActionChoice[]>(listActions, { ...filters, status: ActionStatus.ONGOING, limit: 50 }),
  ]);
  if (!openResult.ok) return openResult;
  if (!ongoingResult.ok) return ongoingResult;
  return { ok: true, data: [...openResult.data, ...ongoingResult.data] };
}

function formatActionRows(
  rows: Array<{ id: string; url?: string; sequenceNumber?: number | null; title: string; status: string; dueDate?: Date | string | null }>,
  copy: InternalAgentCopy,
) {
  if (rows.length === 0) return copy.mock.noOpenActions;

  return [
    formatInternalAgentCopy(copy.mock.openActionsFound, { count: rows.length }),
    ...(rows.length > 10 ? [copy.locale === "pt" ? "A mostrar as primeiras 10 ações." : "Showing the first 10 actions."] : []),
    ...rows.slice(0, 10).map((row) => {
      const code = row.sequenceNumber ? `#${row.sequenceNumber}` : row.id;
      const dueDate = row.dueDate
        ? `, ${formatInternalAgentCopy(copy.mock.dueDate, { date: new Date(row.dueDate).toLocaleDateString(copy.locale) })}`
        : "";
      return `- ${row.url ? `[${code}](${row.url})` : code}: ${row.title} (${row.status}${dueDate})`;
    }),
  ].join("\n");
}

function formatCommunicationRows(
  rows: Array<{ code?: string | null; id: string; url?: string; type: string; status: string; description?: string | null }>,
  copy: InternalAgentCopy,
) {
  if (rows.length === 0) return copy.mock.noCommunications;

  return [
    formatInternalAgentCopy(copy.mock.communicationsFound, { count: rows.length }),
    ...(rows.length > 10 ? [copy.locale === "pt" ? "A mostrar as primeiras 10 comunicações." : "Showing the first 10 communications."] : []),
    ...rows.slice(0, 10).map((row) => `- ${row.url ? `[${row.code ?? row.id}](${row.url})` : row.code ?? row.id}: ${row.type} (${row.status}) - ${row.description ?? copy.mock.noDescription}`),
  ].join("\n");
}

function formatKpiResult(data: unknown, copy: InternalAgentCopy) {
  if (!data || typeof data !== "object") return copy.mock.kpisFound;
  return `${copy.mock.kpisFound}\n${JSON.stringify(data, null, 2).slice(0, 1800)}`;
}

function formatOverdueActionRows(data: {
  count: number;
  actions: Array<{ id: string; url?: string; sequenceNumber?: number | null; title: string; priority: string; status: string; dueDate?: Date | string | null }>;
}, copy: InternalAgentCopy) {
  if (data.count === 0) return copy.mock.noOverdueActions;

  return [
    formatInternalAgentCopy(copy.mock.overdueActionsFound, { count: data.count }),
    ...(data.count > 10 ? [copy.locale === "pt" ? "A mostrar as primeiras 10 ações." : "Showing the first 10 actions."] : []),
    ...data.actions.slice(0, 10).map((row) => {
      const code = row.sequenceNumber ? `#${row.sequenceNumber}` : row.id;
      const dueDate = row.dueDate
        ? `, ${formatInternalAgentCopy(copy.mock.dueDate, { date: new Date(row.dueDate).toLocaleDateString(copy.locale) })}`
        : "";
      return `- ${row.url ? `[${code}](${row.url})` : code}: ${row.title} (${row.priority}, ${row.status}${dueDate})`;
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

function formatFilterSummary(filters: Record<string, unknown>, locale: string) {
  const labels: Record<string, string> = locale === "pt"
    ? { status: "estado", type: "tipo", dateFrom: "desde", dateTo: "até", dueDateFrom: "prazo desde", dueDateTo: "prazo até", areaName: "departamento/área", search: "texto", ownerName: "responsável", priority: "prioridade" }
    : { status: "status", type: "type", dateFrom: "from", dateTo: "to", dueDateFrom: "due from", dueDateTo: "due to", areaName: "department/area", search: "text", ownerName: "owner", priority: "priority" };
  const entries = Object.entries(filters).filter(([key, value]) => key !== "limit" && value !== undefined && value !== "");
  if (!entries.length) return "";
  const prefix = locale === "pt" ? "Filtros aplicados" : "Filters applied";
  return `${prefix}: ${entries.map(([key, value]) => {
    const displayValue = typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.slice(0, 10) : String(value).replaceAll("_", " ");
    return `${labels[key] ?? key} ${displayValue}`;
  }).join(" · ")}.\n`;
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

export async function runMockAgent(ctx: AgentToolContext, message: string, intent?: AgentIntent | null): Promise<MockAgentResult> {
  const copy = getInternalAgentCopy(ctx.session.user.language);
  const normalized = normalizeText(message);
  const resolvedIntent = intent ?? resolveAgentIntent(message);
  const mentionsAction = includesAny(normalized, ["aco", "acao", "action", "azione", "dzialan", "massnahm", "actiune"]);
  const requestsList = includesAny(normalized, ["lista", "list", "elenca", "auflist", "afis", "affich"]);

  if (resolvedIntent === "LIST_OVERDUE_ACTIONS") {
    const findOverdueActions = getTool(createActionTools(ctx), "find_overdue_actions");
    const filters = extractOverdueActionFilters(message);
    const result = await invokeTool<{
      count: number;
      actions: Array<{ id: string; url?: string; sequenceNumber?: number | null; title: string; priority: string; status: string; dueDate?: Date | string | null }>;
    }>(findOverdueActions, { ...filters, limit: 25 });

    return {
      message: result.ok ? `${formatFilterSummary(filters, copy.locale)}${formatOverdueActionRows(result.data, copy)}` : formatToolFailure(result, copy, "overdue"),
      confirmation: null,
    };
  }

  if (resolvedIntent === "LIST_OPEN_ACTIONS") {
    const filters = extractActionFilters(message);
    const result = await listActionChoices(ctx, filters);
    return {
      message: result.ok ? `${formatFilterSummary(filters, copy.locale)}${formatActionRows(result.data, copy)}` : formatToolFailure(result, copy, "open"),
      confirmation: null,
    };
  }

  if (resolvedIntent === "LIST_COMMUNICATIONS") {
    const listCommunications = getTool(createCommunicationTools(ctx), "list_communications");
    const filters = extractCommunicationFilters(message);
    const result = await invokeTool<Array<{ code?: string | null; id: string; url?: string; type: string; status: string; description?: string | null }>>(
      listCommunications,
      { ...filters, limit: 25 },
    );
    return {
      message: result.ok ? `${formatFilterSummary(filters, copy.locale)}${formatCommunicationRows(result.data, copy)}` : formatToolFailure(result, copy, "communications"),
      confirmation: null,
    };
  }

  if (resolvedIntent === "SHOW_PLANT_KPIS") {
    const now = new Date();
    const getKpis = getTool(createKpiTools(ctx), "get_monthly_kpis");
    const result = await invokeTool(getKpis, { year: now.getFullYear(), month: now.getMonth() + 1 });
    return {
      message: result.ok ? formatKpiResult(result.data, copy) : formatToolFailure(result, copy, "kpis"),
      confirmation: null,
    };
  }

  if (resolvedIntent === "GENERATE_CURRENT_MONTH_REPORT") {
    const generatePeriodReport = getTool(createReportTools(ctx), "generate_period_report");
    const result = await invokeTool<{
      title?: string;
      fileName?: string;
      periodStart?: Date | string;
      periodEnd?: Date | string;
    }>(generatePeriodReport, { reportType: "MONTHLY" });
    return {
      message: result.ok ? formatReportResult(result.data, copy) : formatToolFailure(result, copy, "report"),
      confirmation: null,
    };
  }

  if (resolvedIntent === "START_UPDATE_ACTION_PRIORITY") {
    const actionId = await resolveActionIdForClose(ctx, message);
    const priority = extractPriority(message);
    if (!actionId) {
      const result = await listActionChoices(ctx);
      return {
        message: result.ok && result.data.length === 0 ? copy.mock.noOpenActions : flowCopy(copy, "chooseAction"),
        confirmation: null,
        flow: result.ok && result.data.length > 0 ? { type: "update_priority", actions: result.data } : null,
      };
    }
    if (!priority) return { message: flowCopy(copy, "choosePriority"), confirmation: null };

    const result = await prepareUpdateActionPriorityForAgent(ctx, { actionId, priority });
    if (!result.ok) return { message: formatToolFailure(result, copy, "priority"), confirmation: null };
    return {
      message: ctx.pendingConfirmation?.summary ?? copy.mock.confirmationRequired,
      confirmation: ctx.pendingConfirmation ?? null,
    };
  }

  if (resolvedIntent === "START_CLOSE_ACTION") {
    const actionId = await resolveActionIdForClose(ctx, message);
    if (!actionId) {
      const result = await listActionChoices(ctx);
      return {
        message: result.ok && result.data.length === 0 ? copy.mock.noOpenActions : flowCopy(copy, "chooseAction"),
        confirmation: null,
        flow: result.ok && result.data.length > 0 ? { type: "close_action", actions: result.data } : null,
      };
    }

    const result = await prepareCloseActionForAgent(ctx, {
      actionId,
      closureComment: copy.mock.closureComment,
      closedAt: new Date().toISOString(),
      evidence: [],
    });
    if (!result.ok) return { message: formatToolFailure(result, copy, "close"), confirmation: null };
    return {
      message: ctx.pendingConfirmation?.summary ?? copy.mock.confirmationRequired,
      confirmation: ctx.pendingConfirmation ?? null,
    };
  }

  if (includesAny(normalized, ["atraso", "overdue", "scadut", "zalegl", "uberfall", "intarzi", "retard"])) {
    const findOverdueActions = getTool(createActionTools(ctx), "find_overdue_actions");
    const filters = extractOverdueActionFilters(message);
    const result = await invokeTool<{
      count: number;
      actions: Array<{ id: string; url?: string; sequenceNumber?: number | null; title: string; priority: string; status: string; dueDate?: Date | string | null }>;
    }>(findOverdueActions, { ...filters, limit: 25 });

    return {
      message: result.ok ? `${formatFilterSummary(filters, copy.locale)}${formatOverdueActionRows(result.data, copy)}` : copy.mock.operationFailed,
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
    message: `${copy.mock.help}\n${copy.locale === "pt" ? "Que informação pretende consultar ou alterar?" : "What information would you like to view or change?"}`,
    confirmation: null,
  };
}
