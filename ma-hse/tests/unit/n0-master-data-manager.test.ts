// @vitest-environment jsdom

import { createElement, type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { N0MasterDataManager } from "@/components/feature/n0-master-data-manager";
import { getStaticN0MasterDataUi } from "@/lib/master-data-ui";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/settings",
}));

const labels = getStaticN0MasterDataUi("en");

function buildResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderManager(input?: Partial<ComponentProps<typeof N0MasterDataManager>>) {
  return render(
    createElement(N0MasterDataManager, {
      plantCode: "pl1",
      initialAreas: [],
      initialWorkstations: [],
      initialEquipments: [],
      initialWorkers: [],
      initialNearMissTypes: [],
      initialUnsafeActTypes: [],
      initialUnsafeConditionTypes: [],
      initialInjuryTypes: [],
      labels,
      ...input,
    }),
  );
}

function getSectionForm(name: string) {
  const heading = screen.getByRole("heading", { name });
  const form = heading.closest("form");
  if (!form) {
    throw new Error(`Form not found for section ${name}`);
  }
  return form;
}

describe("N0MasterDataManager", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("allows admin to create a workstation with editable fields and the correct payload", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      buildResponse({
        ok: true,
        data: {
          item: { id: "ws-2", code: "WS2", name: "Packing 2" },
        },
      }, 201),
    );

    renderManager();
    const form = getSectionForm("Workstations");
    const codeInput = within(form).getByPlaceholderText("Workstation code") as HTMLInputElement;
    const nameInput = within(form).getByPlaceholderText("Workstation name") as HTMLInputElement;
    const saveButton = within(form).getByRole("button", { name: "Save workstation" }) as HTMLButtonElement;

    expect(codeInput.disabled).toBe(false);
    expect(codeInput.readOnly).toBe(false);
    expect(nameInput.disabled).toBe(false);
    expect(nameInput.readOnly).toBe(false);
    expect(saveButton.disabled).toBe(false);

    fireEvent.change(codeInput, { target: { value: " WS2 " } });
    fireEvent.change(nameInput, { target: { value: " Packing 2 " } });
    fireEvent.click(saveButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/plants/pl1/admin/master-data");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      type: "workstation",
      code: "WS2",
      name: "Packing 2",
    });
    expect(await within(form).findByText("Workstations created successfully.")).toBeTruthy();
  });

  it("allows admin to edit and save a workstation", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      buildResponse({
        ok: true,
        data: {
          item: { id: "ws-1", code: "WS1", name: "Packing 1B" },
        },
      }),
    );

    renderManager({
      initialWorkstations: [{ id: "ws-1", code: "WS1", name: "Packing 1" }],
    });

    const form = getSectionForm("Workstations");
    fireEvent.click(within(form).getByRole("button", { name: "Edit" }));

    const codeInput = within(form).getByPlaceholderText("Workstation code") as HTMLInputElement;
    const nameInput = within(form).getByPlaceholderText("Workstation name") as HTMLInputElement;
    expect(codeInput.value).toBe("WS1");
    expect(nameInput.value).toBe("Packing 1");
    expect(codeInput.disabled).toBe(false);

    fireEvent.change(nameInput, { target: { value: "Packing 1B" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      id: "ws-1",
      type: "workstation",
      code: "WS1",
      name: "Packing 1B",
    });
    expect(await within(form).findByText("Workstations updated successfully.")).toBeTruthy();
  });

  it("allows admin to create and edit equipment", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        buildResponse({
          ok: true,
          data: {
            item: { id: "eq-2", code: "EQ2", name: "Forklift 2" },
          },
        }, 201),
      )
      .mockResolvedValueOnce(
        buildResponse({
          ok: true,
          data: {
            item: { id: "eq-1", code: "EQ1", name: "Forklift 1B" },
          },
        }),
      );

    renderManager({
      initialEquipments: [{ id: "eq-1", code: "EQ1", name: "Forklift 1" }],
    });

    const form = getSectionForm("Equipment");
    const codeInput = within(form).getByPlaceholderText("Equipment code") as HTMLInputElement;
    const nameInput = within(form).getByPlaceholderText("Equipment name") as HTMLInputElement;
    const saveButton = within(form).getByRole("button", { name: "Save equipment" }) as HTMLButtonElement;

    expect(codeInput.disabled).toBe(false);
    expect(nameInput.readOnly).toBe(false);
    expect(saveButton.disabled).toBe(false);

    fireEvent.change(codeInput, { target: { value: "EQ2" } });
    fireEvent.change(nameInput, { target: { value: "Forklift 2" } });
    fireEvent.click(saveButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      type: "equipment",
      code: "EQ2",
      name: "Forklift 2",
    });
    expect(await within(form).findByText("Equipment created successfully.")).toBeTruthy();

    const equipmentRow = within(form).getByText("EQ1").closest("div.rounded-md");
    if (!equipmentRow) {
      throw new Error("Equipment row not found");
    }
    fireEvent.click(within(equipmentRow).getByRole("button", { name: "Edit" }));
    expect(codeInput.value).toBe("EQ1");
    fireEvent.change(nameInput, { target: { value: "Forklift 1B" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      id: "eq-1",
      type: "equipment",
      code: "EQ1",
      name: "Forklift 1B",
    });
    expect(await within(form).findByText("Equipment updated successfully.")).toBeTruthy();
  });

  it("shows duplicate equipment code feedback inline without calling the API", async () => {
    const fetchMock = vi.mocked(fetch);

    renderManager({
      initialEquipments: [{ id: "eq-1", code: "EQ1", name: "Forklift 1" }],
    });

    const form = getSectionForm("Equipment");
    fireEvent.change(within(form).getByPlaceholderText("Equipment code"), { target: { value: " EQ1 " } });
    fireEvent.change(within(form).getByPlaceholderText("Equipment name"), { target: { value: "Another Forklift" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save equipment" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await within(form).findByText(labels.sections.equipment.duplicateMessage)).toBeTruthy();
  });

  it("shows API errors to the admin when save fails", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      buildResponse(
        {
          ok: false,
          message: labels.permissionDenied,
        },
        403,
      ),
    );

    renderManager();
    const form = getSectionForm("Equipment");

    fireEvent.change(within(form).getByPlaceholderText("Equipment code"), { target: { value: "EQ9" } });
    fireEvent.change(within(form).getByPlaceholderText("Equipment name"), { target: { value: "Forklift 9" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save equipment" }));

    expect(await within(form).findByText(labels.permissionDenied)).toBeTruthy();
  });

  it("allows admin to deactivate all items in a catalog section", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      buildResponse({
        ok: true,
        data: {
          deletedType: "equipment",
          deletedCount: 2,
          deleteAll: true,
        },
      }),
    );

    renderManager({
      initialEquipments: [
        { id: "eq-1", code: "EQ1", name: "Forklift 1" },
        { id: "eq-2", code: "EQ2", name: "Forklift 2" },
      ],
    });

    const form = getSectionForm("Equipment");
    fireEvent.click(within(form).getByRole("button", { name: "Deactivate all" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      type: "equipment",
      deleteAll: true,
    });
    expect(await within(form).findByText(labels.sections.equipment.deleteAllSuccess)).toBeTruthy();
    expect(within(form).getByText("EQ1")).toBeTruthy();
    expect(within(form).getByText("EQ2")).toBeTruthy();
    expect(within(form).getAllByRole("button", { name: labels.users.activate })).toHaveLength(2);
  });

  it("allows N3 to explicitly reactivate inactive equipment through the shared manager", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      buildResponse({
        ok: true,
        data: {
          item: { id: "eq-1", code: "EQ1", name: "Forklift 1", isActive: true },
        },
      }),
    );

    renderManager({
      visibleCatalogTypes: ["area", "workstation", "equipment"],
      initialEquipments: [{ id: "eq-1", code: "EQ1", name: "Forklift 1", isActive: false }],
    });

    const form = getSectionForm("Equipment");
    fireEvent.click(within(form).getByRole("button", { name: labels.users.activate }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/plants/pl1/admin/master-data");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      id: "eq-1",
      type: "equipment",
      code: "EQ1",
      name: "Forklift 1",
    });
    expect(await within(form).findByRole("button", { name: labels.deactivate })).toBeTruthy();
  });

  it("allows admin to deactivate all workers in the section", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      buildResponse({
        ok: true,
        data: {
          deletedCount: 2,
          deleteAll: true,
        },
      }),
    );

    renderManager({
      initialWorkers: [
        { id: "w-1", employeeNo: "1001", name: "Maria Silva", dept: "Prod" },
        { id: "w-2", employeeNo: "1002", name: "Joao Costa", dept: "Qual" },
      ],
    });

    const form = getSectionForm("Workers");
    fireEvent.click(within(form).getByRole("button", { name: "Deactivate all" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/plants/pl1/admin/workers");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      deleteAll: true,
    });
    expect(await within(form).findByText(labels.workerDeleteAllSuccess)).toBeTruthy();
    expect(within(form).getByText("1001")).toBeTruthy();
    expect(within(form).getByText("1002")).toBeTruthy();
    expect(within(form).getByText(/Maria Silva.*inactive/)).toBeTruthy();
    expect(within(form).getByText(/Joao Costa.*inactive/)).toBeTruthy();
  });

  it("shows the shared localized equipment subsection for the N3 configuration", () => {
    const ptLabels = getStaticN0MasterDataUi("pt");

    renderManager({
      labels: ptLabels,
      visibleCatalogTypes: ["area", "workstation", "equipment"],
      initialEquipments: [{ id: "eq-1", code: "EQ1", name: "Empilhador 1" }],
    });

    const form = getSectionForm(ptLabels.sections.equipment.title);
    expect(within(form).getByPlaceholderText(ptLabels.sections.equipment.codePlaceholder)).toBeTruthy();
    expect(within(form).getByPlaceholderText(ptLabels.sections.equipment.namePlaceholder)).toBeTruthy();
    expect(within(form).getByRole("button", { name: ptLabels.sections.equipment.createLabel })).toBeTruthy();
    expect(within(form).getByRole("button", { name: ptLabels.deactivateAll })).toBeTruthy();
    expect(within(form).getByText("EQ1")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: ptLabels.sections.unsafeActType.title })).toBeNull();
  });

  it("refreshes the equipment list when the selected authorized plant changes", async () => {
    const baseProps: ComponentProps<typeof N0MasterDataManager> = {
      plantCode: "pl1",
      initialAreas: [],
      initialWorkstations: [],
      initialEquipments: [{ id: "eq-1", code: "PL1-EQ", name: "Plant 1 equipment" }],
      initialWorkers: [],
      initialNearMissTypes: [],
      initialUnsafeActTypes: [],
      initialUnsafeConditionTypes: [],
      initialInjuryTypes: [],
      visibleCatalogTypes: ["area", "workstation", "equipment"],
      labels,
    };
    const view = render(createElement(N0MasterDataManager, baseProps));

    expect(screen.getByText("PL1-EQ")).toBeTruthy();

    view.rerender(createElement(N0MasterDataManager, {
      ...baseProps,
      plantCode: "pl2",
      initialEquipments: [{ id: "eq-2", code: "PL2-EQ", name: "Plant 2 equipment" }],
    }));

    await waitFor(() => expect(screen.queryByText("PL1-EQ")).toBeNull());
    expect(screen.getByText("PL2-EQ")).toBeTruthy();
  });
});
