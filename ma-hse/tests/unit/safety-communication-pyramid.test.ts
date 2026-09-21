// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SafetyCommunicationPyramid, type PyramidRecord } from "@/components/feature/safety-communication-pyramid";
import { getUiDictionary } from "@/lib/ui-language";

const zeroCounts = { fatal: 0, seriousInjury: 0, minorInjury: 0, firstAid: 0, nearMiss: 0, unsafeCondition: 0, unsafeAct: 0 };
const props = { title: "Safety Communication Pyramid", counts: zeroCounts, scopeLabel: "Plant / Production", periodLabel: "2026-01-01 - 2026-12-31" };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("SafetyCommunicationPyramid", () => {
  it("keeps all severity levels and unavailable percentages when empty", () => {
    render(createElement(SafetyCommunicationPyramid, props));
    expect(screen.getByRole("status").textContent).toContain("All levels remain visible");
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(7);
    expect(screen.getAllByText(getUiDictionary("en").dashboard.kpiNotApplicable)).toHaveLength(7);
    expect(screen.getByText("0 communications")).toBeTruthy();
  });

  it("shows the total once, localized percentages and accessible classification help", () => {
    render(createElement(SafetyCommunicationPyramid, { ...props, locale: "pt", counts: { ...zeroCounts, nearMiss: 6, unsafeAct: 4 }, helpLabel: "Ajuda da pirâmide" }));
    expect(screen.getByText("10 comunicações")).toBeTruthy();
    expect(screen.getByText("60,0%")).toBeTruthy();
    expect(screen.getAllByText("% do total")).toHaveLength(1);
    expect(screen.queryByText("% of total")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ajuda da pirâmide" }));
    expect(screen.getByRole("dialog", { name: props.title })).toBeTruthy();
    expect(screen.getByTestId("pyramid-events-nearMiss").textContent).toBe("6");
    expect(screen.getByTestId("pyramid-band-fatal").getAttribute("style")).toContain("--safety-pyramid-fatal");
  });

  it("retains homologous values in the expandable comparison", () => {
    render(createElement(SafetyCommunicationPyramid, { ...props, counts: { ...zeroCounts, firstAid: 1 }, previousCounts: { ...zeroCounts, firstAid: 3 } }));
    expect(screen.getByText("100.0%")).toBeTruthy();
    expect(screen.getByText("3 → 1 (-2)")).toBeTruthy();
    expect(screen.getByText(/Trend ·/).closest("details")?.open).toBe(false);
  });

  it("opens only the selected severity records and uses real communication links", () => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
    const records: PyramidRecord[] = [{ id: "a", code: "CS-1", level: "nearMiss", pending: false }, { id: "b", code: "CS-2", level: "unsafeAct", pending: true }];
    render(createElement(SafetyCommunicationPyramid, { ...props, counts: { ...zeroCounts, nearMiss: 1, unsafeAct: 1 }, records, plantCode: "maap" }));
    expect(screen.getByText("1 validated · 1 pending validation")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Near Miss: 1/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("link", { name: "CS-1" }).getAttribute("href")).toBe("/app/maap/communications/a");
    expect(within(dialog).queryByRole("link", { name: "CS-2" })).toBeNull();
    expect(within(dialog).getByText(/Plant \/ Production/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
