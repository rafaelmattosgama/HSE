// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InternalAgentChat } from "@/components/feature/internal-agent-chat";

const quickActions = [
  ["Ações abertas", "LIST_OPEN_ACTIONS"],
  ["Ações em atraso", "LIST_OVERDUE_ACTIONS"],
  ["Comunicações", "LIST_COMMUNICATIONS"],
  ["KPIs da fábrica", "SHOW_PLANT_KPIS"],
  ["Relatório do mês", "GENERATE_CURRENT_MONTH_REPORT"],
  ["Atualizar prioridade", "START_UPDATE_ACTION_PRIORITY"],
  ["Fechar uma ação", "START_CLOSE_ACTION"],
] as const;

function successResponse(data: Record<string, unknown> = { message: "Concluído." }) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("InternalAgentChat quick actions", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the seven quick actions on open, with responsive and accessible controls", () => {
    render(createElement(InternalAgentChat, { plantCode: "pt01", locale: "pt" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir chat do agente interno" }));

    expect(screen.getByText("Como posso ajudar nesta fábrica?")).toBeTruthy();
    expect(screen.getByText("Escolha uma das opções ou escreva a sua pergunta.")).toBeTruthy();
    for (const [label] of quickActions) expect(screen.getByRole("button", { name: label })).toBeTruthy();

    const grid = screen.getByRole("button", { name: "Ações abertas" }).parentElement;
    expect(grid?.className).toContain("grid-cols-2");
    expect(grid?.className).toContain("max-[359px]:grid-cols-1");
    expect(screen.getByRole("button", { name: "Ações abertas" }).className).toContain("focus-visible:ring-2");
  });

  it("sends stable intents independently of quick-action labels and can show the options again", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(InternalAgentChat, { plantCode: "pt01", locale: "pt" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir chat do agente interno" }));

    for (const [label, intent] of quickActions) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(quickActions.findIndex(([entry]) => entry === label) + 1));
      const body = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
      expect(body).toMatchObject({ plantCode: "pt01", intent });
      expect(body.message).not.toBe(label);
      fireEvent.click(screen.getByRole("button", { name: "Ver opções" }));
    }
  });

  it("prevents duplicate quick-action requests while loading", async () => {
    let complete!: (response: Response) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((resolve) => { complete = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(InternalAgentChat, { plantCode: "pt01", locale: "pt" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir chat do agente interno" }));

    const button = screen.getByRole("button", { name: "Ações abertas" });
    button.focus();
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.click(button);
    fireEvent.doubleClick(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Ver opções" }));
    const busyButton = screen.getByRole("button", { name: "Ações abertas" });
    await waitFor(() => expect((busyButton as HTMLButtonElement).disabled).toBe(true));

    complete(successResponse());
    await waitFor(() => expect((busyButton as HTMLButtonElement).disabled).toBe(false));
  });

  it("requires an explicit confirmation after selecting an action to close", async () => {
    const action = { id: "11111111-1111-4111-8111-111111111111", sequenceNumber: 7, title: "Corrigir guarda", status: "OPEN", priority: "HIGH" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(successResponse({ message: "Selecione primeiro uma ação.", flow: { type: "close_action", actions: [action] } }))
      .mockResolvedValueOnce(successResponse({ message: "Confirme o fecho.", confirmation: { confirmationId: "22222222-2222-4222-8222-222222222222", summary: "Fechar ação #7", status: "pending" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(InternalAgentChat, { plantCode: "pt01", locale: "pt" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir chat do agente interno" }));
    fireEvent.click(screen.getByRole("button", { name: "Fechar uma ação" }));
    await screen.findByRole("button", { name: "Selecione uma ação: #7 Corrigir guarda" });

    fireEvent.click(screen.getByRole("button", { name: "Selecione uma ação: #7 Corrigir guarda" }));
    await screen.findByRole("button", { name: "Confirmar" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      intent: "START_CLOSE_ACTION",
      message: expect.stringContaining(action.id),
    });
  });

  it("localizes API errors without accepting a locale from the client", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, errorCode: "AGENT_RATE_LIMITED", message: "Demasiados pedidos ao agente." }), {
      status: 429,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(InternalAgentChat, { plantCode: "fr01", locale: "fr" }));
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le chat de l'agent interne" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "Mes KPI" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le message" }));

    expect(await screen.findByText("Trop de demandes. Veuillez réessayer dans quelques secondes.")).toBeTruthy();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ plantCode: "fr01", message: "Mes KPI", intent: "SHOW_PLANT_KPIS" });
  });
});
