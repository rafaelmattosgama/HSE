// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MasterDataManager } from "@/components/feature/master-data-manager";
import { N0MasterDataManager } from "@/components/feature/n0-master-data-manager";
import { getStaticN0MasterDataUi } from "@/lib/master-data-ui";

vi.mock("next/navigation", () => ({ usePathname: () => "/app/pl1/admin" }));

const labels = getStaticN0MasterDataUi("pt");
const worker = { id: "11111111-1111-4111-8111-111111111111", employeeNo: "10", name: "Guto Santos", dept: "Produção" };

describe.each([
  { name: "MasterDataManager", Manager: MasterDataManager },
  { name: "N0MasterDataManager", Manager: N0MasterDataManager },
])("$name worker editing", ({ Manager }) => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function renderWorker(isActive: boolean) {
    render(createElement(Manager, {
      plantCode: "pl1",
      initialAreas: [],
      initialWorkstations: [],
      initialEquipments: [],
      initialWorkers: [{ ...worker, isActive }],
      initialNearMissTypes: [],
      initialUnsafeActTypes: [],
      initialUnsafeConditionTypes: [],
      initialInjuryTypes: [],
      labels,
    }));
    const form = screen.getByRole("heading", { name: labels.workerSectionTitle }).closest("form")!;
    fireEvent.click(within(form).getByRole("button", { name: labels.edit }));
    return form;
  }

  it.each([
    { initialActive: false, savedActive: true },
    { initialActive: false, savedActive: false },
    { initialActive: true, savedActive: true },
    { initialActive: true, savedActive: false },
  ])("saves an edited worker from $initialActive to $savedActive using the same ID", async ({ initialActive, savedActive }) => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      data: { worker: { ...worker, name: "Guto Santos Silva", isActive: savedActive } },
    })));
    const form = renderWorker(initialActive);
    const checkbox = within(form).getByRole("checkbox", { name: labels.users.active }) as HTMLInputElement;
    expect(checkbox.checked).toBe(initialActive);
    if (initialActive !== savedActive) fireEvent.click(checkbox);
    fireEvent.change(within(form).getByPlaceholderText(labels.workerName), { target: { value: "Guto Santos Silva" } });
    fireEvent.click(within(form).getByRole("button", { name: labels.saveChanges }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/plants/pl1/admin/workers");
    expect(JSON.parse(String(request?.body))).toEqual({ ...worker, name: "Guto Santos Silva", isActive: savedActive });
    expect(await screen.findByText(labels.workerUpdated)).toBeTruthy();
    expect(within(form).getByText(new RegExp(`Guto Santos Silva.*${savedActive ? labels.active : labels.inactive}`))).toBeTruthy();
    expect(within(form).queryByRole("checkbox")).toBeNull();
  });

  it("keeps the status choice and existing list when saving fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, message: "Falha ao guardar" }), { status: 500 }));
    const form = renderWorker(false);
    fireEvent.click(within(form).getByRole("checkbox", { name: labels.users.active }));
    fireEvent.click(within(form).getByRole("button", { name: labels.saveChanges }));
    expect(await screen.findByText("Falha ao guardar")).toBeTruthy();
    expect((within(form).getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    expect(within(form).getByText(new RegExp(`Guto Santos.*${labels.inactive}`))).toBeTruthy();
  });
});
