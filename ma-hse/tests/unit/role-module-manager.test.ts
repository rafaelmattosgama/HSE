// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoleModuleManager } from "@/components/feature/role-module-manager";
import { getStaticN0MasterDataUi } from "@/lib/master-data-ui";
import { resolveModuleToggles } from "@/lib/modules";
import { resolveRoleModuleSettings } from "@/lib/role-modules";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const labels = getStaticN0MasterDataUi("pt");
const authorized = resolveModuleToggles({ MAPA: false });
const initialRoles = resolveRoleModuleSettings(authorized, null);
const props = { plantCode: "maap", authorized, initialRoles, labels, moduleLabels: { ACTIONS: "Ações", OCCUPATIONAL_HEALTH: "Medicina do Trabalho" } };

beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); refresh.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("N3 modules by profile", () => {
  it("only offers authorized modules within the permissions of each profile", () => {
    render(createElement(RoleModuleManager, props));
    expect(screen.queryByRole("checkbox", { name: /MAPA/ })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Medicina do Trabalho — N6 — HR" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Medicina do Trabalho — N4 — Supervisor" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Validations/ })).toBeNull();
  });

  it("saves separate profile choices to the selected factory", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { roles: resolveRoleModuleSettings(authorized, { N4_SUPERVISOR: { ACTIONS: false } }) } })));
    render(createElement(RoleModuleManager, props));
    fireEvent.click(screen.getByRole("checkbox", { name: "Ações — N4 — Supervisor" }));
    expect((screen.getByRole("checkbox", { name: "Ações — N5 — Operator" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: labels.savePlantModules }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/plants/maap/admin/role-modules");
    const payload = JSON.parse(String(init?.body));
    expect(payload.roles.N4_SUPERVISOR.ACTIONS).toBe(false);
    expect(payload.roles.N5_OPERATOR.ACTIONS).toBe(true);
    expect(payload.roles.N4_SUPERVISOR).not.toHaveProperty("MAPA");
    expect(payload.roles.N4_SUPERVISOR).not.toHaveProperty("OCCUPATIONAL_HEALTH");
    expect(await screen.findByText(labels.moduleSettingsSaved)).toBeTruthy();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("retains unsaved choices and shows errors when authorization changes", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: false, message: "Módulo não autorizado" }), { status: 403 }));
    render(createElement(RoleModuleManager, props));
    fireEvent.click(screen.getByRole("checkbox", { name: "Ações — N4 — Supervisor" }));
    fireEvent.click(screen.getByRole("button", { name: labels.savePlantModules }));
    expect(await screen.findByText("Módulo não autorizado")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
    expect((screen.getByRole("checkbox", { name: "Ações — N4 — Supervisor" }) as HTMLInputElement).checked).toBe(false);
  });
});
