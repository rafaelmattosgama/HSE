// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SafetyDashboardKpiGroups } from "@/components/feature/safety-dashboard-kpi-groups";
import { getUiDictionary } from "@/lib/ui-language";

const labels = getUiDictionary("en").dashboard;

const baseMetrics = {
  validatedEvents: 2, injuries: 0, daysLost: 0, firstAids: 1,
  frequencyRate: 0, gravityRate: 0, firstAidRate: 13.3,
  nearMisses: 0, unsafeActs: 0, unsafeConditions: 0, rootCauses: 12,
  openActions: 24, overdueActions: 7, closedOnTimePercent: 82,
  unsafeActsClosedPercent: null, unsafeConditionsClosedPercent: null,
  pendingValidation: 1, openCommunications: 3, myOpenActions: 3,
  hoursWorked: 75243,
};

const MAIN_GROUPS = ["outcomes", "sifPsif", "leading", "actions", "competences", "fireEquipment"];

function renderGroups(extra: Record<string, unknown> = {}) {
  return render(createElement(SafetyDashboardKpiGroups, {
    locale: "en",
    periodLabel: "2026-01-01 - 2026-12-31",
    labels,
    detailed: true,
    showPendingValidationKpi: true,
    canViewOpenCommunications: true,
    metrics: baseMetrics,
    ...extra,
  } as never));
}

describe("composição por grupos", () => {
  afterEach(cleanup);

  it("renderiza todos os grupos quando a prop é omitida", () => {
    renderGroups();
    expect(screen.getByRole("heading", { name: labels.kpiSafetyOutcomes })).toBeTruthy();
    expect(screen.getByRole("heading", { name: labels.kpiExposureScope })).toBeTruthy();
    expect(screen.getByRole("heading", { name: labels.kpiActionsCompliance })).toBeTruthy();
  });

  it("renderiza só a exposição quando pedida isoladamente", () => {
    renderGroups({ groups: ["exposure"] });
    expect(screen.getByRole("heading", { name: labels.kpiExposureScope })).toBeTruthy();
    expect(screen.getByText(labels.hoursWorked)).toBeTruthy();
    expect(screen.getByText(labels.plants)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: labels.kpiSafetyOutcomes })).toBeNull();
    expect(screen.queryByRole("heading", { name: labels.kpiActionsCompliance })).toBeNull();
  });

  it("omite a exposição quando pedidos os restantes grupos", () => {
    renderGroups({ groups: MAIN_GROUPS });
    expect(screen.getByRole("heading", { name: labels.kpiSafetyOutcomes })).toBeTruthy();
    expect(screen.getByRole("heading", { name: labels.kpiActionsCompliance })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: labels.kpiExposureScope })).toBeNull();
  });

  it("permite um identificador de teste próprio", () => {
    const { container } = renderGroups({ groups: ["exposure"], testId: "safety-kpi-context" });
    expect(container.querySelector('[data-testid="safety-kpi-context"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="safety-kpi-groups"]')).toBeNull();
  });

  it("junta os dois subconjuntos sem perder nem duplicar indicadores", () => {
    const todos = renderGroups();
    const totalCompleto = todos.container.querySelectorAll(".app-kpi-card").length;
    cleanup();

    const principal = renderGroups({ groups: MAIN_GROUPS });
    const totalPrincipal = principal.container.querySelectorAll(".app-kpi-card").length;
    cleanup();

    const contexto = renderGroups({ groups: ["exposure"] });
    const totalContexto = contexto.container.querySelectorAll(".app-kpi-card").length;

    expect(totalCompleto).toBeGreaterThan(0);
    expect(totalContexto).toBeGreaterThan(0);
    expect(totalPrincipal + totalContexto).toBe(totalCompleto);
  });
});
