// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoBanner } from "@/components/layout/demo-banner";
import { DemoAccounts } from "@/components/layout/demo-accounts";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("demo UI", () => {
  it("shows the banner only in demo mode", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    const { container } = render(createElement(DemoBanner));
    expect(container.textContent).toBe("");
    cleanup();
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    render(createElement(DemoBanner));
    expect(screen.getByText(/DEMONSTRAÇÃO/)).toBeTruthy();
  });

  it("lists demo accounts and picks one", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    const onPick = vi.fn();
    render(createElement(DemoAccounts, { onPick }));
    fireEvent.click(screen.getByText("demo.seguranca@maxsafety.demo"));
    expect(onPick).toHaveBeenCalledWith("demo.seguranca@maxsafety.demo");
    expect(screen.getByText(/Demo2026!/)).toBeTruthy();
  });

  it("hides the demo accounts outside demo mode", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    const { container } = render(createElement(DemoAccounts, { onPick: vi.fn() }));
    expect(container.textContent).toBe("");
  });
});
