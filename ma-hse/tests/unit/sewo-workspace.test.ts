// @vitest-environment jsdom

import { createElement, type ComponentProps } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BASE_SEWO_UI, type SewoUi } from "@/lib/sewo-ui";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/components/feature/create-sewo-quick", () => ({
  CreateSewoQuick: () => createElement("div"),
}));

import { SewoWorkspace } from "@/components/feature/sewo-workspace";

const ui = { ...BASE_SEWO_UI, locale: "en" } as SewoUi;

const row = {
  id: "sewo-1",
  codigoSewo: "MAAP-SEWO-2026-0001",
  date: "2026-08-19",
  local: "Assembly",
  typeLabel: "First Aid",
  status: "DRAFT",
  statusLabel: "Draft",
  updatedAt: "2026-08-19T10:00:00.000Z",
  linkedActionCount: 0,
  communicationId: "communication-1",
  performedByName: "Safety User",
  description: "Draft investigation",
  formData: {
    id: "sewo-1",
    codigoSewo: "MAAP-SEWO-2026-0001",
    communicationId: "communication-1",
    eventClassification: "FIRST_AID",
    areaId: null,
    workstationId: null,
    shiftId: null,
    analysisDate: "2026-08-19T10:00:00.000Z",
    whatText: "First aid",
    whereText: "Assembly",
    whoText: "Worker",
    usualWorkYesNo: true,
    whichText: null,
    howText: "Draft investigation",
    immediateCorrectiveActionText: "",
    templateData: {},
    causeCatalogVersionId: "catalog-1",
    status: "DRAFT",
    approvalComment: null,
    approvedAt: null,
    approvedByName: null,
    attachments: [],
    linkedActions: [],
  },
};

function renderWorkspace(overrides: Partial<ComponentProps<typeof SewoWorkspace>> = {}) {
  return render(createElement(SewoWorkspace, {
    plant: "maap",
    sewoRows: [row],
    communications: [],
    areas: [],
    workstations: [],
    shifts: [],
    workers: [],
    bodyParts: [],
    injuryTypes: [],
    actionOwners: [],
    ui,
    rootCauseGroups: [],
    canDeleteSewo: true,
    ...overrides,
  }));
}

describe("SewoWorkspace deletion", () => {
  afterEach(() => {
    cleanup();
    refresh.mockClear();
    vi.unstubAllGlobals();
  });

  it("opens a confirmation modal and leaves the row unchanged when cancelled", () => {
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: /delete s-ewo maap-sewo-2026-0001/i }));

    const dialog = screen.getByRole("dialog", { name: "Delete S-EWO?" });
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText("2026-08-19")).toBeTruthy();
    expect(within(dialog).getByText("Assembly")).toBeTruthy();
    expect(within(dialog).getByText("First Aid")).toBeTruthy();
    expect(within(dialog).getByText("Draft")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("MAAP-SEWO-2026-0001")).toBeTruthy();
  });

  it("removes the row only after a successful API response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { id: "sewo-1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: /delete s-ewo maap-sewo-2026-0001/i }));
    fireEvent.click(screen.getByRole("button", { name: "Delete S-EWO" }));

    await waitFor(() => expect(screen.queryByText("MAAP-SEWO-2026-0001")).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith("/api/plants/maap/sewo/sewo-1", expect.objectContaining({
      method: "DELETE",
      body: JSON.stringify({ updatedAt: "2026-08-19T10:00:00.000Z" }),
    }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps the row and shows the API error when deletion fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, message: "Record changed" }), { status: 409 })));
    renderWorkspace();

    fireEvent.click(screen.getByRole("button", { name: /delete s-ewo maap-sewo-2026-0001/i }));
    fireEvent.click(screen.getByRole("button", { name: "Delete S-EWO" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Record changed");
    expect(screen.getAllByText("MAAP-SEWO-2026-0001")).toHaveLength(2);
  });

  it("disables deletion for unauthorized users and for records with dependencies", () => {
    const { rerender } = renderWorkspace({ canDeleteSewo: false });

    expect(screen.getByRole("button", { name: /delete s-ewo maap-sewo-2026-0001/i }).hasAttribute("disabled")).toBe(true);

    rerender(createElement(SewoWorkspace, {
      plant: "maap",
      sewoRows: [{ ...row, linkedActionCount: 1 }],
      communications: [],
      areas: [],
      workstations: [],
      shifts: [],
      workers: [],
      bodyParts: [],
      injuryTypes: [],
      actionOwners: [],
      ui,
      rootCauseGroups: [],
      canDeleteSewo: true,
    }));

    expect(screen.getByRole("button", { name: /delete s-ewo maap-sewo-2026-0001/i }).hasAttribute("disabled")).toBe(true);
  });
});
