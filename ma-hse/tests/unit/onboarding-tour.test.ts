// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOnboardingCopy } from "@/components/onboarding/onboarding-i18n";
import { OnboardingTour } from "@/components/onboarding/onboarding-tour";

const navigationMock = vi.hoisted(() => ({
  push: vi.fn(),
  usePathname: vi.fn(),
  useRouter: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: navigationMock.usePathname,
  useRouter: navigationMock.useRouter,
}));

describe("OnboardingTour", () => {
  beforeEach(() => {
    navigationMock.usePathname.mockReturnValue("/app/pt11/dashboards");
    navigationMock.useRouter.mockReturnValue({ push: navigationMock.push });
    const target = document.createElement("div");
    target.dataset.onboarding = "topbar";
    document.body.append(target);
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("shows the step controls and advances when Seguinte is selected", async () => {
    const onMove = vi.fn();
    const view = render(createElement(OnboardingTour, {
      active: true,
      currentStep: 0,
      steps: [
        {
          id: "quick-access",
          element: '[data-onboarding="topbar"]',
          title: "Acesso rápido",
          description: "Aqui encontra os alertas e as opções da sua conta.",
        },
        {
          id: "dashboard",
          element: '[data-onboarding="dashboard-overview"]',
          title: "Dashboard",
          description: "Consulte os principais indicadores.",
        },
      ],
      copy: getOnboardingCopy("pt").tour,
      onMove,
      onComplete: vi.fn(),
      onExit: vi.fn(),
    }));

    const nextButton = await screen.findByRole("button", { name: "Seguinte" });
    await waitFor(() => expect(nextButton.style.display).toBe("block"));
    expect((screen.getByRole("button", { name: "Anterior" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Sair da visita guiada" })).toBeTruthy();

    fireEvent.click(nextButton);
    expect(onMove).toHaveBeenCalledWith(1);

    view.unmount();
  });

  it("localizes controls, progress and accessibility labels", async () => {
    render(createElement(OnboardingTour, {
      active: true,
      currentStep: 0,
      steps: [
        {
          id: "quick-access",
          element: '[data-onboarding="topbar"]',
          title: "Schnellzugriff",
          description: "Kontoeinstellungen und Warnmeldungen.",
        },
        {
          id: "dashboard",
          element: '[data-onboarding="dashboard-overview"]',
          title: "Dashboard",
          description: "Sicherheitskennzahlen.",
        },
      ],
      copy: getOnboardingCopy("de").tour,
      onMove: vi.fn(),
      onComplete: vi.fn(),
      onExit: vi.fn(),
    }));

    expect(await screen.findByRole("button", { name: "Weiter" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zurück" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Geführte Tour verlassen" })).toBeTruthy();
    expect(screen.getByText("Schritt 1 von 2")).toBeTruthy();
    const dialog = screen.getByRole("dialog", { name: "Schnellzugriff" });
    expect(dialog.getAttribute("aria-label")).toBe("Geführte Tour: Schnellzugriff");
  });
});
