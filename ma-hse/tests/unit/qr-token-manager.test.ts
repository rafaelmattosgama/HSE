// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QrTokenManager } from "@/components/feature/qr-token-manager";

vi.mock("next/navigation", () => ({ usePathname: () => "/app/pl01/admin" }));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,test") } }));

describe("QR token manager protection", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, data: { type: "REPORT", token: "test-token", path: "/r/pl01/report" } }),
    }));
    vi.spyOn(window, "confirm").mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("disables report regeneration by default while keeping the saved QR available", () => {
    localStorage.setItem("ma-hse:qr:pl01:REPORT", JSON.stringify({
      type: "REPORT", token: "existing-token", publicUrl: "http://localhost/r/pl01/report?t=existing-token",
      qrDataUrl: "data:image/png;base64,existing",
    }));
    render(createElement(QrTokenManager));
    const regenerate = screen.getByRole("button", { name: "Regenerate Report QR token" }) as HTMLButtonElement;
    expect(regenerate.disabled).toBe(true);
    fireEvent.click(regenerate);
    expect(fetch).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(screen.getByText("Report QR regeneration is disabled. Existing QR codes remain valid.")).toBeTruthy();
    expect(screen.getByRole("img", { name: "REPORT QR code" })).toBeTruthy();
    for (const name of ["Copy link", "Open link", "Save image", "Print QR"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(false);
    }
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "KIOSK" } });
    expect(screen.queryByRole("img")).toBeNull();
    expect((screen.getByRole("button", { name: "Regenerate Kiosk QR token" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("enabling the feature alone never generates a token and cancellation makes no request", () => {
    render(createElement(QrTokenManager, { reportRegenerationEnabled: true }));
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Regenerate Report QR token" }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("will stop working"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("regenerates only after confirmation when enabled", async () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    render(createElement(QrTokenManager, { reportRegenerationEnabled: true }));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate Report QR token" }));
    await waitFor(() => expect(screen.getByRole("img", { name: "REPORT QR code" })).toBeTruthy());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/plants/pl01/admin/qr-tokens", expect.objectContaining({
      body: JSON.stringify({ type: "REPORT", regenerate: true }),
    }));
  });
});
