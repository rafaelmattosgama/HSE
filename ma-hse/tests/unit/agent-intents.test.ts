import { describe, expect, it } from "vitest";
import { buildActionFlowMessage, getAgentMessageForIntent, resolveAgentIntent } from "@/lib/agent/intents";

describe("agent intent normalization", () => {
  it.each([
    ["ações", "LIST_OPEN_ACTIONS"],
    ["mostrar ações", "LIST_OPEN_ACTIONS"],
    ["lista de ações abertas", "LIST_OPEN_ACTIONS"],
    ["ações atrasadas", "LIST_OVERDUE_ACTIONS"],
    ["ações vencidas", "LIST_OVERDUE_ACTIONS"],
    ["overdue actions", "LIST_OVERDUE_ACTIONS"],
    ["comunicações", "LIST_COMMUNICATIONS"],
    ["mostrar comunicações", "LIST_COMMUNICATIONS"],
    ["indicadores", "SHOW_PLANT_KPIS"],
    ["números da fábrica", "SHOW_PLANT_KPIS"],
    ["KPIs", "SHOW_PLANT_KPIS"],
    ["relatório mensal", "GENERATE_CURRENT_MONTH_REPORT"],
    ["relatório deste mês", "GENERATE_CURRENT_MONTH_REPORT"],
    ["current month report", "GENERATE_CURRENT_MONTH_REPORT"],
    ["alterar prioridade", "START_UPDATE_ACTION_PRIORITY"],
    ["mudar a prioridade da ação", "START_UPDATE_ACTION_PRIORITY"],
    ["concluir ação", "START_CLOSE_ACTION"],
    ["fechar ação", "START_CLOSE_ACTION"],
    ["close action", "START_CLOSE_ACTION"],
    ["acoo em atrasoo", "LIST_OVERDUE_ACTIONS"],
  ] as const)("maps %s to %s", (message, intent) => {
    expect(resolveAgentIntent(message)).toBe(intent);
  });

  it("uses fixed protocol messages rather than UI labels", () => {
    expect(getAgentMessageForIntent("LIST_OPEN_ACTIONS")).toBe("List open actions.");
    expect(buildActionFlowMessage({ intent: "START_CLOSE_ACTION", actionId: "action-id" })).toBe("Close action action-id.");
  });
});
