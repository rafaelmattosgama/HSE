// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SafetyCommunicationPyramid } from "@/components/feature/safety-communication-pyramid";

const zeroCounts = {
  fatal: 0,
  seriousInjury: 0,
  minorInjury: 0,
  firstAid: 0,
  nearMiss: 0,
  unsafeCondition: 0,
  unsafeAct: 0,
};

describe("SafetyCommunicationPyramid", () => {
  afterEach(cleanup);

  it("keeps all seven severity levels visible with an explicit zero-data state", () => {
    render(createElement(SafetyCommunicationPyramid, {
      title: "Safety Communication Pyramid",
      counts: zeroCounts,
      scopeLabel: "Plant A",
      periodLabel: "2026-01-01 - 2026-01-31",
    }));

    expect(screen.getByRole("status").textContent).toContain("All levels remain visible");
    expect(screen.getByText("Fatal")).toBeTruthy();
    expect(screen.getByText("Serious injury")).toBeTruthy();
    expect(screen.getByText("Minor injury")).toBeTruthy();
    expect(screen.getByText("First aid")).toBeTruthy();
    expect(screen.getByText("Near miss")).toBeTruthy();
    expect(screen.getByText("Unsafe condition")).toBeTruthy();
    expect(screen.getByText("Unsafe act")).toBeTruthy();
    expect(screen.getByLabelText(/Fatal: 0/i).getAttribute("style")).toContain("--safety-pyramid-fatal");
    expect(screen.getByLabelText(/Unsafe act: 0/i).getAttribute("style")).toContain("--safety-pyramid-unsafe-act");
    expect(screen.getAllByText("—")).toHaveLength(7);
  });

  it("explains hierarchy, exposes the count denominator and remains keyboard-accessible", () => {
    render(createElement(SafetyCommunicationPyramid, {
      title: "Safety Communication Pyramid",
      counts: { ...zeroCounts, nearMiss: 6, unsafeAct: 4 },
      previousCounts: { ...zeroCounts, nearMiss: 2, unsafeAct: 4 },
      scopeLabel: "Plant A",
      periodLabel: "2026-01-01 - 2026-01-31",
      helpLabel: "Pyramid help",
    }));

    expect(screen.getAllByText("of 10")).toHaveLength(7);
    expect(screen.getByText(/width communicates severity hierarchy/i)).toBeTruthy();
    expect(screen.getByLabelText(/Near miss: 6, 60.0 percent/i)).toBeTruthy();

    const help = screen.getByRole("button", { name: "Pyramid help" });
    help.focus();
    fireEvent.keyDown(help, { key: "Enter" });
    fireEvent.click(help);
    expect(screen.getByRole("dialog", { name: "Safety Communication Pyramid" })).toBeTruthy();

    const firstLayer = screen.getByLabelText(/Fatal: 0/i);
    expect(firstLayer.className).toContain("w-full");
    expect(firstLayer.className).toContain("sm:w-[var(--pyramid-layer-width)]");
  });
});
