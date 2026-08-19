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
    expect(screen.queryByText("01 Fatal")).toBeNull();
    expect(screen.getByTestId("pyramid-band-fatal").getAttribute("style")).toContain("--safety-pyramid-fatal");
    expect(screen.getByTestId("pyramid-band-unsafeAct").getAttribute("style")).toContain("--safety-pyramid-unsafe-act");
    expect(screen.getAllByText("Not applicable")).toHaveLength(7);
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
    expect(screen.getAllByText("% of total")).toHaveLength(7);
    expect(screen.queryByText("Events")).toBeNull();
    expect(screen.getByText(/width communicates severity hierarchy/i)).toBeTruthy();
    expect(screen.getByLabelText(/Near miss: 6, 60.0 percent/i)).toBeTruthy();

    const help = screen.getByRole("button", { name: "Pyramid help" });
    help.focus();
    fireEvent.keyDown(help, { key: "Enter" });
    fireEvent.click(help);
    expect(screen.getByRole("dialog", { name: "Safety Communication Pyramid" })).toBeTruthy();

    const firstLayer = screen.getByLabelText(/Fatal: 0/i);
    expect(firstLayer.className).toContain("md:grid-cols-[minmax(0,1fr)_minmax(6.5rem,0.22fr)]");
    expect(screen.getByTestId("pyramid-band-fatal").className).toContain("md:w-[var(--pyramid-layer-width)]");
    expect(screen.getByTestId("pyramid-band-fatal").querySelector('[data-testid^="pyramid-metrics-"]')).toBeNull();
    expect(screen.getByTestId("pyramid-events-fatal").textContent).toBe("0");
  });

  it("keeps the current first-aid scenario and 100.0 percent visible in the band", () => {
    render(createElement(SafetyCommunicationPyramid, {
      title: "Safety Communication Pyramid",
      counts: { ...zeroCounts, firstAid: 1 },
      scopeLabel: "Valença - MAAP",
      periodLabel: "2026-01-01 - 2026-12-31",
    }));

    expect(screen.getByText("Valença - MAAP")).toBeTruthy();
    expect(screen.getByText("2026-01-01 - 2026-12-31")).toBeTruthy();
    expect(screen.getByLabelText(/First aid: 1, 100.0 percent/i)).toBeTruthy();
    expect(screen.getByText("100.0%")).toBeTruthy();
    expect(screen.getAllByText("of 1")).toHaveLength(7);
    expect(screen.getByTestId("pyramid-events-firstAid").textContent).toBe("1");
  });

  it("keeps double-digit values and full titles legible within the responsive bands", () => {
    render(createElement(SafetyCommunicationPyramid, {
      title: "Safety Communication Pyramid",
      counts: { ...zeroCounts, nearMiss: 12, unsafeAct: 100 },
      scopeLabel: "Valença - MAAP",
      periodLabel: "2026-01-01 - 2026-12-31",
    }));

    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("100")).toBeTruthy();
    expect(screen.getAllByText("of 112")).toHaveLength(7);

    for (const name of ["Fatal", "Serious injury", "Minor injury", "First aid", "Near miss", "Unsafe condition", "Unsafe act"]) {
      expect(screen.getByText(name).className).toContain("break-words");
      expect(screen.getByText(name).className).not.toContain("truncate");
    }

    for (const row of Array.from(document.querySelectorAll("ol > li > article"))) {
      expect(row.className).toContain("grid-cols-1");
      expect(row.className).toContain("md:grid-cols-[minmax(0,1fr)_minmax(6.5rem,0.22fr)]");
      expect(row.className).not.toContain("absolute");
      expect(row.className).not.toContain("overflow-x");
    }

    expect(screen.getByTestId("pyramid-metrics-unsafeAct")).toBeTruthy();
    expect(screen.getByTestId("pyramid-events-unsafeAct").textContent).toBe("100");
  });
});
