// @vitest-environment jsdom

import { createElement, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, onClick, children, ...rest }: { href: string; onClick?: () => void; children: ReactNode }) =>
    createElement("a", {
      href,
      ...rest,
      onClick: (event: Event) => {
        event.preventDefault();
        onClick?.();
      },
    }, children),
}));

import { ActionFloatingAlert } from "@/components/feature/action-floating-alert";
import { CompetenceUrgentAlert } from "@/components/feature/competence-urgent-alert";
import { FireEquipmentUrgentAlert } from "@/components/feature/fire-equipment-urgent-alert";
import { SafetyCommunicationFloatingAlert } from "@/components/feature/safety-communication-floating-alert";
import type { CompetencesUiDictionary, FireEquipmentUiDictionary } from "@/lib/ui-language";

// Every label renders as its own key, so the test can find buttons by key.
const keyLabels = new Proxy({}, { get: (_target, key) => String(key) });

function alert(id: string) {
  return { id, title: `Alerta ${id}`, body: "Detalhe", createdAt: "2026-11-17T22:52:00.000Z", actionUrl: `/app/maap/x/${id}` };
}

function okJson(data: unknown) {
  return Promise.resolve(new Response(JSON.stringify({ ok: true, data }), { status: 200 }));
}

describe("floating alerts: open closes the panel", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn((_url: string, init?: RequestInit) => (init?.method === "POST" ? okJson({ updated: 1 }) : okJson([alert("a1"), alert("a2")])));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("closes the safety communication alert window and marks the opened alert as read", async () => {
    render(createElement(SafetyCommunicationFloatingAlert, { plantCode: "maap", enabled: true }));
    const [openFirst] = await screen.findAllByText("Abrir comunicacao");

    fireEvent.click(openFirst);

    await waitFor(() => expect(screen.queryByText("Alertas de comunicacoes de seguranca")).toBeNull());
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("/api/plants/maap/notifications/acknowledge");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ notificationIds: ["a1"] });
    expect(post?.[1]?.keepalive).toBe(true);
  });

  it.each([
    ["competence", () => createElement(CompetenceUrgentAlert, { plantCode: "maap", enabled: true, labels: keyLabels as CompetencesUiDictionary }), "urgentAlertOpenWorker"],
    ["fire equipment", () => createElement(FireEquipmentUrgentAlert, { plantCode: "maap", enabled: true, labels: keyLabels as FireEquipmentUiDictionary }), "urgentAlertOpenEquipment"],
  ] as const)("closes the %s urgent alert window and marks the opened alert as read", async (_name, element, openLabel) => {
    render(element());
    const [openFirst] = await screen.findAllByText(openLabel);

    fireEvent.click(openFirst);

    await waitFor(() => expect(screen.queryByText("urgentAlertTitle")).toBeNull());
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("/api/plants/maap/notifications/acknowledge");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ notificationIds: ["a1"] });
  });

  it("closes the action alerts and marks the opened alert as read", async () => {
    render(createElement(ActionFloatingAlert, { enabled: true }));
    const [openFirst] = await screen.findAllByText("Abrir ação");

    fireEvent.click(openFirst);

    await waitFor(() => expect(screen.queryByText("Abrir ação")).toBeNull());
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("/api/notifications/actions");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ notificationIds: ["a1"] });
  });
});
