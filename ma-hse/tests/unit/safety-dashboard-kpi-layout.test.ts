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

describe("layout fluido das grelhas de KPIs", () => {
  afterEach(cleanup);

  it("usa auto-fill em vez de um número fixo de colunas", () => {
    const { container } = renderGroups();
    const grids = container.querySelectorAll('[class*="auto-fill"]');
    expect(grids.length).toBeGreaterThanOrEqual(2);
  });

  it("não deixa nenhuma grelha de KPIs presa em xl:grid-cols-4", () => {
    const { container } = renderGroups();
    expect(container.querySelectorAll(".xl\\:grid-cols-4").length).toBe(0);
  });

  it("mantém o mínimo de 240px por cartão", () => {
    const { container } = renderGroups();
    const grid = container.querySelector('[class*="auto-fill"]');
    expect(grid?.className).toContain("minmax(min(100%,240px),1fr)");
  });

  it("continua a mostrar todos os indicadores de resultado", () => {
    renderGroups();
    expect(screen.getByText(labels.kpiDaysLost)).toBeTruthy();
    expect(screen.getByText(labels.hoursWorked)).toBeTruthy();
  });
});
