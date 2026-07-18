// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getOnboardingCopy } from "@/components/onboarding/onboarding-i18n";
import { WelcomeModal } from "@/components/onboarding/welcome-modal";

describe("welcome onboarding modal", () => {
  afterEach(cleanup);

  it("shows the first-access message and both choices", () => {
    render(createElement(WelcomeModal, {
      open: true,
      busy: false,
      copy: getOnboardingCopy("pt").welcome,
      onStart: vi.fn(),
      onDismiss: vi.fn(),
    }));

    expect(screen.getByRole("dialog", { name: "Bem-vindo ao MA HSE" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Iniciar visita guiada" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Explorar mais tarde" })).toBeTruthy();
  });

  it("keeps initial focus in the modal and allows dismissal with Escape", () => {
    const onDismiss = vi.fn();
    render(createElement(WelcomeModal, {
      open: true,
      busy: false,
      copy: getOnboardingCopy("pt").welcome,
      onStart: vi.fn(),
      onDismiss,
    }));

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Iniciar visita guiada" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("uses the user's predefined language", () => {
    render(createElement(WelcomeModal, {
      open: true,
      busy: false,
      copy: getOnboardingCopy("de").welcome,
      onStart: vi.fn(),
      onDismiss: vi.fn(),
    }));

    expect(screen.getByRole("dialog", { name: "Willkommen bei MA HSE" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Geführte Tour starten" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Später erkunden" })).toBeTruthy();
  });
});
