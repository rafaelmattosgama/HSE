// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SewoValidationQueue } from "@/components/feature/sewo-validation-queue";
import { BASE_SEWO_UI, type SewoUi } from "@/lib/sewo-ui";

const routerMock = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

const ui = { ...BASE_SEWO_UI, locale: "en" } as SewoUi;
const row = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "sewo_PL01NM202601",
  plantCode: "pl01",
  plantName: "Plant 01",
  occurrenceType: "Near Miss",
  statusLabel: "Submitted",
  location: "Assembly",
  description: "A near miss occurred.",
  analysisDate: "2026-08-18T09:00:00.000Z",
  submittedAt: "2026-08-18T10:00:00.000Z",
  submittedByName: "Safety User",
  submittedByRole: "N3_SAFETY",
  sifPsifResult: "NO_PSIF" as const,
};

function successResponse() {
  return new Response(JSON.stringify({ ok: true, data: { id: row.id, status: "APPROVED" } }), {
    headers: { "content-type": "application/json" },
  });
}

describe("SewoValidationQueue", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("opens the share choice before validation and sends Don't share as a normal validation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(SewoValidationQueue, { rows: [row], ui, showPlant: true }));

    expect(screen.queryByTitle(ui.n1ValidationExportExcel)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: ui.n1ValidationApprove }));

    expect(screen.getByRole("dialog", { name: ui.n1ValidationSharePromptTitle })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: ui.n1ValidationSharePromptDontShare }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      approved: true,
      approvalComment: "Validated by N1.",
      shareReport: false,
    });
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it("uses the existing approval endpoint with sharing when Share is chosen", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(SewoValidationQueue, { rows: [row], ui }));

    fireEvent.click(screen.getByRole("button", { name: ui.n1ValidationApprove }));
    fireEvent.click(screen.getByRole("button", { name: ui.n1ValidationSharePromptShare }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      approved: true,
      shareReport: true,
    });
  });

  it("keeps rejection outside the share prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(createElement(SewoValidationQueue, { rows: [row], ui }));

    fireEvent.click(screen.getByRole("button", { name: ui.n1ValidationReject }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole("dialog", { name: ui.n1ValidationSharePromptTitle })).toBeNull();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      approved: false,
      shareReport: false,
    });
  });
});
