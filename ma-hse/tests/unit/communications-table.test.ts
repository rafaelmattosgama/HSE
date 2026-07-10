// @vitest-environment jsdom

import { createElement } from "react";
import { CommunicationStatus, CommunicationType } from "@prisma/client";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommunicationsTable } from "@/components/feature/communications-table";

const navigationMock = vi.hoisted(() => ({
  useRouter: vi.fn(),
}));

vi.mock("next/navigation", () => navigationMock);

describe("CommunicationsTable", () => {
  let anchorClickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    navigationMock.useRouter.mockReturnValue({ refresh: vi.fn() });
    anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["export"]),
      headers: new Headers(),
    }));
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:export"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    anchorClickSpy.mockRestore();
    cleanup();
    vi.unstubAllGlobals();
  });

  it("groups submitted and pending validation rows under the In validation filter and export label", async () => {
    const rows = [
      {
        id: "comm-submitted",
        codigoCompleto: "PT11-001",
        eventDatetime: "2026-06-01T08:00:00.000Z",
        type: CommunicationType.UNSAFE_CONDITION,
        status: CommunicationStatus.SUBMITTED,
        reporterName: "Ana",
        department: "Assembly",
        location: "Line 1",
        involvedWorker: "-",
        description: "Submitted row",
      },
      {
        id: "comm-pending",
        codigoCompleto: "PT11-002",
        eventDatetime: "2026-06-02T08:00:00.000Z",
        type: CommunicationType.NEAR_MISS,
        status: CommunicationStatus.PENDING_VALIDATION,
        reporterName: "Bruno",
        department: "Assembly",
        location: "Line 2",
        involvedWorker: "Worker",
        description: "Pending row",
      },
      {
        id: "comm-open",
        codigoCompleto: "PT11-003",
        eventDatetime: "2026-06-03T08:00:00.000Z",
        type: CommunicationType.UNSAFE_ACT,
        status: CommunicationStatus.VALID_OPEN,
        reporterName: "Carla",
        department: "Logistics",
        location: "Dock",
        involvedWorker: "Worker",
        description: "Open row",
      },
    ];

    render(createElement(CommunicationsTable, {
      plant: "pt11",
      rows,
    }));

    expect(screen.getAllByText("In validation")).toHaveLength(3);
    expect(screen.getByText("3 communication(s) shown.")).toBeTruthy();

    const statusSelect = screen.getByDisplayValue("All statuses") as HTMLSelectElement;
    fireEvent.change(statusSelect, { target: { value: "in_validation" } });

    expect(screen.getByText("2 communication(s) shown.")).toBeTruthy();
    expect(screen.getByText("PT11-001")).toBeTruthy();
    expect(screen.getByText("PT11-002")).toBeTruthy();
    expect(screen.queryByText("PT11-003")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Export Excel" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    const [, request] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String((request as RequestInit).body));
    expect(body.rows).toEqual([
      expect.objectContaining({ code: "PT11-001", status: "In validation" }),
      expect.objectContaining({ code: "PT11-002", status: "In validation" }),
    ]);
  });
});
