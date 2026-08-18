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
      endpoint: "/api/admin/modules",
      title: "MÃ³dulos das plantas",
      description: "Configure os mÃ³dulos.",
      saveLabel: "Guardar mÃ³dulos globais",
      initialModules: resolveModuleToggles(),
      moduleLabels: { ENVIRONMENT_DASHBOARD: "Dashboard de Ambiente" },
    }));

    const dashboardToggle = screen.getByRole("checkbox", { name: "Dashboard de Ambiente" }) as HTMLInputElement;
    expect(dashboardToggle.checked).toBe(true);
    fireEvent.click(dashboardToggle);
    fireEvent.click(screen.getByRole("button", { name: "Guardar mÃ³dulos globais" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      modules: { ENVIRONMENT_DASHBOARD: false },
    });
  });
});
