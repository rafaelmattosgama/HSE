// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement as h } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlantSafetyRankings } from "@/components/feature/plant-safety-rankings";
import { SafetyDashboardOverview } from "@/components/feature/safety-dashboard-overview";
import { DashboardDepartmentFilter } from "@/components/feature/dashboard-department-filter";
import { SafetyDaysSpotlight } from "@/components/feature/safety-days-dashboard";
import { getUiDictionary } from "@/lib/ui-language";
import type { RankingGroup } from "@/lib/dashboard-visualization";

const labels = getUiDictionary("pt").dashboard;
const rankings: RankingGroup[] = Array.from({ length: 6 }, (_, i) => ({ id: String(i), title: `Ranking ${i}`, variant: "percent", higher: [{ plantCode: `row-${i}`, plantName: `Classificação ${i}`, value: 25, count: 2, total: 8, percentage: 25 }], lower: [] }));
const metrics = { validatedEvents: 12, injuries: 3, daysLost: 0, firstAids: 1, frequencyRate: null, gravityRate: null, firstAidRate: null, nearMisses: 0, unsafeActs: 0, unsafeConditions: 0, rootCauses: 12, openActions: 24, overdueActions: 7, closedOnTimePercent: null, unsafeActsClosedPercent: null, unsafeConditionsClosedPercent: null, pendingValidation: 1, openCommunications: 3, myOpenActions: 3, hoursWorked: null };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("plant safety layout", () => {
  it("switches the primary ranking without duplicating it and expands the remaining rankings", () => {
    render(h(PlantSafetyRankings, { rankings, scopeLabel: "MAAP / Produção", labels, locale: "pt" }));
    expect(screen.getByText("Classificação 0")).toBeTruthy();
    expect(screen.queryByText("Classificação 1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ranking 1" }));
    expect(screen.queryByText("Classificação 0")).toBeNull();
    expect(screen.getByText("Classificação 1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ranking 1" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Classificação 4").closest('[hidden]')).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mais rankings" }));
    expect(screen.getByText("Classificação 4").closest('[hidden]')).toBeNull();
    expect(screen.getAllByText("Base: 8")).toHaveLength(3);
    const primaryRow = screen.getByText("Classificação 1").closest("li")!;
    expect(within(primaryRow).getByText("· 25,0%")).toBeTruthy();
    expect(primaryRow.querySelector('[style]')?.getAttribute("style")).toContain("width: 25%");
  });

  it("uses the new department and preserves an exact date range on submission", () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, "requestSubmit").mockImplementation(() => {});
    render(h(DashboardDepartmentFilter, { departmentId: "a", departments: [{ id: "a", code: "A", name: "Produção" }, { id: "b", code: "B", name: "Qualidade" }], label: "Departamento", allLabel: "Todos", dates: { from: "2026-02-01", to: "2026-03-17" } }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "b" } });
    expect(submit).toHaveBeenCalledOnce();
    const form = screen.getByTestId("dashboard-department-filter") as HTMLFormElement;
    expect(Object.fromEntries(new FormData(form))).toEqual({ departmentId: "b", from: "2026-02-01", to: "2026-03-17" });
  });

  it("keeps accident semantics and distinguishes missing hours from a zero index", () => {
    render(h(SafetyDashboardOverview, { locale: "pt", labels, periodLabel: "2026", metrics, detailed: true }));
    expect(screen.getByText(labels.injuries)).toBeTruthy();
    expect(screen.queryByText("Acidentes com baixa")).toBeNull();
    expect(screen.getAllByText(labels.kpiNotApplicable)).toHaveLength(2);
    expect(screen.getByText(labels.kpiNoData)).toBeTruthy();
    expect(screen.getByText(/Toda a fábrica/)).toBeTruthy();
  });

  it("does not expose detailed metrics to a role with a restricted overview", () => {
    render(h(SafetyDashboardOverview, { locale: "pt", labels, periodLabel: "2026", metrics, detailed: false }));
    expect(screen.queryByText(labels.frequencyRate)).toBeNull();
    expect(screen.queryByText(labels.injuries)).toBeNull();
    expect(screen.getByText(labels.myOpenActions)).toBeTruthy();
  });

  it("renders the current safety days once in compact mode", () => {
    render(h(SafetyDaysSpotlight, { plantName: "MAAP", labels, locale: "pt", compact: true, summary: { currentDays: 442, recordDays: 823, lastAccidentDate: "2025-07-02", source: "recorded", recordSource: "historical", historicalRecordStartDate: "2019-01-01" } }));
    expect(screen.getAllByText("442")).toHaveLength(1);
    expect(screen.getByText(/823/)).toBeTruthy();
    expect(screen.getByText(/2025-07-02/)).toBeTruthy();
  });
});
