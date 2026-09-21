// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RoleCode } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserManager } from "@/components/feature/user-manager";
import { getStaticN0MasterDataUi } from "@/lib/master-data-ui";

vi.mock("next/navigation", () => ({ usePathname: () => "/app/pl01/admin" }));
const departmentId = "11111111-1111-4111-8111-111111111111";
const departments = [{ id: departmentId, code: "D1", name: "Produção" }];
const labels = getStaticN0MasterDataUi("pt");
const fetchMock = vi.fn();
const response = (data: unknown) => ({ ok: true, json: async () => ({ ok: true, data }) });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
    if (url.endsWith("/departments")) return response({ departments });
    return response(options?.method === "GET" ? { users: [] } : { passwordDelivery: "CUSTOM_SET" });
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.resetAllMocks(); });

function show(role: RoleCode = RoleCode.N2_PLANT_MANAGER) {
  return render(createElement(UserManager, { users: [], allowedCreateRoles: [role, RoleCode.N5_OPERATOR], labels }));
}

describe("user department dropdown", () => {
  it.each([RoleCode.N2_PLANT_MANAGER, RoleCode.N4_SUPERVISOR])("requires a master-data selection for %s and sends its ID", async (role) => {
    const { container } = show(role);
    const option = await screen.findByRole("option", { name: "D1 — Produção" });
    expect(option).toBeTruthy();
    const select = screen.getByRole("combobox", { name: /Departamento/ }) as HTMLSelectElement;
    expect(select.required).toBe(true);
    expect(select.value).toBe("");
    fireEvent.submit(container.querySelector("form")!);
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
    fireEvent.change(screen.getByPlaceholderText("email@company.com"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByPlaceholderText(labels.users.fullName), { target: { value: "New User" } });
    fireEvent.change(select, { target: { value: departmentId } });
    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/plants/pl01/admin/users", expect.objectContaining({ method: "POST", body: expect.stringContaining(`"departmentId":"${departmentId}"`) })));
  });

  it("clears the selection when changing role", async () => {
    show();
    await screen.findByRole("option", { name: "D1 — Produção" });
    fireEvent.change(screen.getByRole("combobox", { name: /Departamento/ }), { target: { value: departmentId } });
    fireEvent.change(screen.getByRole("combobox", { name: labels.users.role }), { target: { value: RoleCode.N5_OPERATOR } });
    expect(screen.queryByRole("combobox", { name: /Departamento/ })).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: labels.users.role }), { target: { value: RoleCode.N2_PLANT_MANAGER } });
    expect((screen.getByRole("combobox", { name: /Departamento/ }) as HTMLSelectElement).value).toBe("");
  });

  it("blocks saving and explains when no active departments exist", async () => {
    fetchMock.mockResolvedValue(response({ departments: [] }));
    show();
    await screen.findByText(labels.users.noDepartments);
    expect((screen.getByRole("button", { name: labels.users.createUser }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the stored department when editing", async () => {
    render(createElement(UserManager, { users: [{ id: "u1", email: "user@example.com", name: "User", language: "pt", isActive: true, role: RoleCode.N4_SUPERVISOR, departmentId, createdAt: new Date(), updatedAt: new Date() }], allowedCreateRoles: [RoleCode.N4_SUPERVISOR], labels }));
    await screen.findByRole("option", { name: "D1 — Produção" });
    fireEvent.click(screen.getByRole("button", { name: labels.edit }));
    await waitFor(() => expect((screen.getByRole("combobox", { name: /Departamento/ }) as HTMLSelectElement).value).toBe(departmentId));
  });

  it("refreshes the master-data options when the field is focused", async () => {
    show();
    await screen.findByRole("option", { name: "D1 — Produção" });
    fetchMock.mockResolvedValue(response({ departments: [{ id: "new-id", code: "D2", name: "Qualidade" }] }));
    fireEvent.focus(screen.getByRole("combobox", { name: /Departamento/ }));
    expect(await screen.findByRole("option", { name: "D2 — Qualidade" })).toBeTruthy();
  });
});
