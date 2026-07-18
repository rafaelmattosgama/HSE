// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InternalAgentChat } from "@/components/feature/internal-agent-chat";

describe("InternalAgentChat localization", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders the complete chat interface in the user's preferred language", () => {
    render(createElement(InternalAgentChat, { plantCode: "de01", locale: "de" }));

    fireEvent.click(screen.getByRole("button", { name: "Chat mit dem internen Agenten öffnen" }));

    expect(screen.getByText("Interner Agent")).toBeTruthy();
    expect(screen.getByText("Wie kann ich an diesem Standort helfen?")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Nachricht" }).getAttribute("placeholder")).toBe("Nachricht schreiben...");
    expect(screen.getByRole("button", { name: "Nachricht senden" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Chat schließen" })).toBeTruthy();
  });

  it("localizes API errors without accepting a locale from the client", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      errorCode: "AGENT_RATE_LIMITED",
      message: "Demasiados pedidos ao agente.",
    }), {
      status: 429,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(InternalAgentChat, { plantCode: "fr01", locale: "fr" }));

    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le chat de l'agent interne" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "Mes KPI" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le message" }));

    expect(await screen.findByText("Trop de demandes. Veuillez réessayer dans quelques secondes.")).toBeTruthy();
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody).toEqual({ plantCode: "fr01", message: "Mes KPI" });
  });
});
