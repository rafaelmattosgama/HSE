export const AGENT_INTENTS = [
  "LIST_OPEN_ACTIONS",
  "LIST_OVERDUE_ACTIONS",
  "LIST_COMMUNICATIONS",
  "SHOW_PLANT_KPIS",
  "GENERATE_CURRENT_MONTH_REPORT",
  "START_UPDATE_ACTION_PRIORITY",
  "START_CLOSE_ACTION",
] as const;

export type AgentIntent = (typeof AGENT_INTENTS)[number];

export type AgentQuickAction = {
  intent: AgentIntent;
  label: string;
  ariaLabel: string;
};

const CANONICAL_MESSAGES: Record<AgentIntent, string> = {
  LIST_OPEN_ACTIONS: "List open actions.",
  LIST_OVERDUE_ACTIONS: "List overdue actions.",
  LIST_COMMUNICATIONS: "List communications.",
  SHOW_PLANT_KPIS: "Show plant KPIs.",
  GENERATE_CURRENT_MONTH_REPORT: "Generate the current month report.",
  START_UPDATE_ACTION_PRIORITY: "Start updating an action priority.",
  START_CLOSE_ACTION: "Start closing an action.",
};

const QUICK_ACTION_LABELS: Record<AgentIntent, string> = {
  LIST_OPEN_ACTIONS: "📋 Ações abertas",
  LIST_OVERDUE_ACTIONS: "⏰ Ações em atraso",
  LIST_COMMUNICATIONS: "📢 Comunicações",
  SHOW_PLANT_KPIS: "📊 KPIs da fábrica",
  GENERATE_CURRENT_MONTH_REPORT: "📄 Relatório do mês",
  START_UPDATE_ACTION_PRIORITY: "⚡ Atualizar prioridade",
  START_CLOSE_ACTION: "✅ Fechar uma ação",
};

const QUICK_ACTION_LABELS_EN: Record<AgentIntent, string> = {
  LIST_OPEN_ACTIONS: "📋 Open actions",
  LIST_OVERDUE_ACTIONS: "⏰ Overdue actions",
  LIST_COMMUNICATIONS: "📢 Communications",
  SHOW_PLANT_KPIS: "📊 Plant KPIs",
  GENERATE_CURRENT_MONTH_REPORT: "📄 Monthly report",
  START_UPDATE_ACTION_PRIORITY: "⚡ Update priority",
  START_CLOSE_ACTION: "✅ Close an action",
};

export function getAgentMessageForIntent(intent: AgentIntent) {
  return CANONICAL_MESSAGES[intent];
}

export function getAgentQuickActions(locale: string): AgentQuickAction[] {
  const labels = locale.toLowerCase().startsWith("pt") ? QUICK_ACTION_LABELS : QUICK_ACTION_LABELS_EN;
  return AGENT_INTENTS.map((intent) => ({
    intent,
    label: labels[intent],
    ariaLabel: labels[intent].replace(/^\S+\s/, ""),
  }));
}

export function buildActionFlowMessage(input: {
  intent: "START_UPDATE_ACTION_PRIORITY" | "START_CLOSE_ACTION";
  actionId: string;
  priority?: "LOW" | "MEDIUM" | "HIGH";
}) {
  if (input.intent === "START_CLOSE_ACTION") return `Close action ${input.actionId}.`;
  return `Update action ${input.actionId} to ${input.priority ?? "MEDIUM"} priority.`;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0]!;
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex]!;
      previous[rightIndex] = Math.min(
        previous[rightIndex - 1]! + 1,
        above + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length]!;
}

function includesKeyword(tokens: string[], keywords: string[]) {
  return keywords.some((keyword) =>
    tokens.some((token) => {
      if (token === keyword || token.startsWith(keyword)) return true;
      if (keyword.length < 4 || token.length < 4) return false;
      return editDistance(token, keyword) <= (keyword.length >= 8 ? 2 : 1);
    }),
  );
}

/**
 * Maps the supported Portuguese and English requests to stable intent IDs.
 * It deliberately keeps this matching deterministic; arbitrary requests still
 * reach the existing LLM path.
 */
export function resolveAgentIntent(message: string | null | undefined): AgentIntent | null {
  const normalized = normalizeText(message ?? "");
  if (!normalized) return null;
  const tokens = normalized.split(" ");
  const has = (keywords: string[]) => includesKeyword(tokens, keywords);
  const action = has(["acao", "acoes", "action", "actions"]);

  if (action && has(["atrasada", "atrasadas", "atraso", "vencida", "vencidas", "overdue", "late"])) {
    return "LIST_OVERDUE_ACTIONS";
  }

  if (has(["atualizar", "atualiza", "actualizar", "alterar", "mudar", "update", "change"]) && has(["prioridade", "priority"])) {
    return "START_UPDATE_ACTION_PRIORITY";
  }

  if (has(["fechar", "fecha", "encerrar", "concluir", "close", "complete"]) && action) {
    return "START_CLOSE_ACTION";
  }

  if (has(["comunicacao", "comunicacoes", "communication", "communications"])) {
    return "LIST_COMMUNICATIONS";
  }

  if (has(["kpi", "kpis", "indicador", "indicadores"]) || (has(["numero", "numeros", "number", "numbers"]) && has(["fabrica", "factory", "plant"]))) {
    return "SHOW_PLANT_KPIS";
  }

  if (has(["relatorio", "report"]) && has(["mensal", "mes", "month", "monthly", "current"])) {
    return "GENERATE_CURRENT_MONTH_REPORT";
  }

  if (action) return "LIST_OPEN_ACTIONS";
  return null;
}
