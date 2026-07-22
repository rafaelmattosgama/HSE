// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HelpPopover } from "@/components/ui/help-popover";

describe("HelpPopover", () => {
  afterEach(cleanup);

  it("exposes an accessible trigger and displays the configured information", () => {
    render(createElement(HelpPopover, {
      title: "Classificação SIF / PSIF",
      body: "Conteúdo explicativo",
      buttonLabel: "Informação sobre a classificação SIF/PSIF",
    }));

    const button = screen.getByRole("button", { name: "Informação sobre a classificação SIF/PSIF" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(button);

    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Classificação SIF / PSIF" })).toBeTruthy();
    expect(screen.getByText("Conteúdo explicativo")).toBeTruthy();
  });

  it("can be dismissed with Escape and returns focus to the trigger", () => {
    render(createElement(HelpPopover, {
      title: "Classificação SIF / PSIF",
      body: "Conteúdo explicativo",
      buttonLabel: "Informação sobre a classificação SIF/PSIF",
    }));

    const button = screen.getByRole("button", { name: "Informação sobre a classificação SIF/PSIF" });
    button.focus();
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("supports pointer hover without pinning the popover", () => {
    render(createElement(HelpPopover, {
      title: "Classificação SIF / PSIF",
      body: "Conteúdo explicativo",
      buttonLabel: "Informação sobre a classificação SIF/PSIF",
    }));

    const button = screen.getByRole("button", { name: "Informação sobre a classificação SIF/PSIF" });
    const container = button.parentElement as HTMLElement;

    fireEvent.mouseEnter(container);
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.mouseLeave(container);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
