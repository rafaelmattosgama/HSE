// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SewoValidationHistory } from "@/components/feature/sewo-validation-history";
import { BASE_SEWO_UI, type SewoUi } from "@/lib/sewo-ui";
import type { SewoValidationHistoryRow } from "@/lib/services/sewo-validation-service";

const routerMock = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

const ui = { ...BASE_SEWO_UI, locale: "en" } as SewoUi;
const rows: SewoValidationHistoryRow[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    code: "sewo_PL01NM202601",
    plantCode: "pl01",
    plantName: "Plant 01",
    createdAt: "2026-08-15T09:00:00.000Z",
    decisionAt: "2026-08-16T10:00:00.000Z",
    status: "APPROVED",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    code: "sewo_PL02NM202602",
    plantCode: "pl02",
    plantName: "Plant 02",
    createdAt: "2026-08-14T09:00:00.000Z",
    decisionAt: null,
    status: "REJECTED",
  },
];

function response(data: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, data }), {
    headers: { "content-type": "application/json" },
  });
}

describe("SewoValidationHistory", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("shows Corporate decisions and persists an edited decision through the protected API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      status: "REJECTED",
      approvedAt: "2026-08-18T10:30:00.000Z",
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(SewoValidationHistory, { rows, ui }));

    expect(screen.getByRole("columnheader", { name: ui.n1ValidationCreationDate })).toBeTruthy();
    expect(screen.getByText("VALIDATED")).toBeTruthy();
    expect(screen.getByText("REJECTED")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: `${ui.n1ValidationEdit} ${rows[0].code}` }));
    expect(screen.getByRole("dialog", { name: ui.n1ValidationChangeDecision })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: ui.n1ValidationConfirm }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/plants/pl01/sewo/${rows[0].id}/approval`);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("PATCH");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ approved: false });
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it("reuses the share endpoint for validated and rejected reports", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ shared: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(SewoValidationHistory, { rows, ui }));

    const approvedShare = screen.getByRole("button", { name: `${ui.n1ValidationShareReport} ${rows[0].code}` });
    const rejectedShare = screen.getByRole("button", { name: `${ui.n1ValidationShareReport} ${rows[1].code}` });
    fireEvent.click(approvedShare);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/plants/pl01/sewo/${rows[0].id}/share`);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");

    fireEvent.click(rejectedShare);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`/api/plants/pl02/sewo/${rows[1].id}/share`);
  });
});
