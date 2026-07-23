// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RepeatabilityAlertModal } from "@/components/feature/repeatability-alert-modal";

const alert = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "S-EWO rejeitado pelo N1",
  body: "S-EWO rejeitado pelo N1.\nAbrir S-EWO: http://localhost:3000/app/maap/sewo?sewoId=sewo-1",
  createdAt: "2026-07-23T20:10:00.000Z",
};

describe("RepeatabilityAlertModal", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("acknowledges N3 profile alerts through the profile alerts API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { updated: 1, unreadCount: 0 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(RepeatabilityAlertModal, {
      plantCode: "maap",
      acknowledgeWithProfileAlerts: true,
      alerts: [alert],
    }));

    fireEvent.click(screen.getByRole("button", { name: "Close alerts" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notifications/profile-alerts",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          notificationIds: [alert.id],
          status: "READ",
        }),
      }),
    );
    await waitFor(() => expect(screen.queryByText(alert.title)).toBeNull());
  });

  it("shows a friendly error instead of the raw HTML parse failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<!DOCTYPE html><html><body>Error</body></html>", {
        status: 500,
        headers: { "content-type": "text/html" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(RepeatabilityAlertModal, {
      plantCode: "maap",
      alerts: [alert],
    }));

    fireEvent.click(screen.getByRole("button", { name: "Close alerts" }));

    expect(await screen.findByText("Failed to close alerts")).toBeTruthy();
    expect(screen.queryByText(/Unexpected token/)).toBeNull();
  });
});
