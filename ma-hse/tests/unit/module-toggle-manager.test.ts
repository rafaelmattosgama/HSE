// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModuleToggleManager } from "@/components/feature/module-toggle-manager";
import { resolveModuleToggles } from "@/lib/modules";

describe("ModuleToggleManager", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows Dashboard de Ambiente and saves its canonical selection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      data: { modules: resolveModuleToggles({ ENVIRONMENT_DASHBOARD: false }) },
    }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(ModuleToggleManager, {
      endpoint: "/api/plants/pl1/admin/modules",
      title: "Módulos das plantas",
      description: "Configure os módulos.",
      saveLabel: "Guardar módulos da planta",
      initialModules: resolveModuleToggles(),
      moduleLabels: { ENVIRONMENT_DASHBOARD: "Dashboard de Ambiente" },
    }));

    const dashboardToggle = screen.getByRole("checkbox", { name: "Dashboard de Ambiente" }) as HTMLInputElement;
    expect(dashboardToggle.checked).toBe(true);
    fireEvent.click(dashboardToggle);
    fireEvent.click(screen.getByRole("button", { name: "Guardar módulos da planta" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/plants/pl1/admin/modules");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      modules: { ENVIRONMENT_DASHBOARD: false },
    });
  });

  it("applies the current unsaved selection to all plants and locks the controls while saving", async () => {
    let finish!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(ModuleToggleManager, {
      endpoint: "/api/plants/pl1/admin/modules",
      title: "Módulos da planta",
      description: "Configure os módulos.",
      saveLabel: "Guardar módulos da planta",
      initialModules: resolveModuleToggles(),
      applyToAll: {
        endpoint: "/api/admin/modules/apply-all",
        label: "Aplicar a todas as plantas",
        successMessage: "Aplicado a todas as plantas.",
      },
    }));
    fireEvent.click(screen.getByRole("checkbox", { name: "S-EWO" }));
    fireEvent.click(screen.getByRole("button", { name: "Aplicar a todas as plantas" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/modules/apply-all", expect.objectContaining({
      body: JSON.stringify({ modules: resolveModuleToggles({ SEWO: false }) }),
    }));
    expect((screen.getByRole("checkbox", { name: "S-EWO" }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Guardar módulos da planta" }) as HTMLButtonElement).disabled).toBe(true);
    finish(new Response(JSON.stringify({ ok: true, data: { modules: resolveModuleToggles({ SEWO: false }) } })));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Aplicado a todas as plantas."));
    expect((screen.getByRole("checkbox", { name: "S-EWO" }) as HTMLInputElement).disabled).toBe(false);
  });
});
