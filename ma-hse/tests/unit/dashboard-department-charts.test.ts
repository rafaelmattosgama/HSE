// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { DashboardVisualizationStudio } from "@/components/feature/dashboard-visualization-studio";
import { CorporatePlantManager } from "@/components/feature/corporate-plant-manager";
import { createEmptyMonthlyMetricSnapshot, type PlantSummary } from "@/lib/dashboard-visualization";
import { getUiDictionary } from "@/lib/ui-language";

const labels = getUiDictionary("en").dashboard;
const snapshot = { ...createEmptyMonthlyMetricSnapshot("2026-01", "Jan 2026"), nearMisses: 1, openActions: 99 };
const plant: PlantSummary = {
  id: "plant-1", code: "pl01", name: "Plant / Production", timezone: "UTC", defaultLanguage: "en",
  validatedEvents: 1, openActions: 99, closedActions: 0, actionsToClose: 99,
  closedActionsPercent: 0, actionsToClosePercent: 100, nearMissCount: 1, injuryCount: 0, rootCauseCount: 0,
  frequencyIndex: 0, severityIndex: 0,
  safetyDays: { currentDays: 0, recordDays: 0, lastAccidentDate: null, source: "plant-start", recordSource: "plant-start", historicalRecordStartDate: null },
  communicationPyramid: { unsafeAct: 0, unsafeCondition: 0, nearMiss: 1, firstAid: 0, minorInjury: 0, seriousInjury: 0, fatal: 0 },
  leaders: [], monthlyMetrics: [snapshot],
};
const props = { plants: [plant], rankings: [], rankingMonthlySeries: {}, activePlantCode: "pl01", storageKeyBase: "department-test", labels };

afterEach(() => { cleanup(); localStorage.clear(); });

it("offers only metrics with departmental data when a department is selected", () => {
  render(createElement(DashboardVisualizationStudio, { ...props, departmentScope: true }));
  expect(screen.getByRole("option", { name: labels.nearMisses })).toBeTruthy();
  expect(screen.queryByRole("option", { name: labels.frequencyRate })).toBeNull();
  expect(screen.queryByRole("option", { name: labels.openActions })).toBeNull();
});

it("resets an unavailable selected metric when switching from plant to department", () => {
  const view = render(createElement(DashboardVisualizationStudio, props));
  const select = screen.getByRole("combobox", { name: labels.indicator });
  fireEvent.change(select, { target: { value: "openActions" } });
  expect((select as HTMLSelectElement).value).toBe("openActions");
  view.rerender(createElement(DashboardVisualizationStudio, { ...props, departmentScope: true }));
  expect((screen.getByRole("combobox", { name: labels.indicator }) as HTMLSelectElement).value).toBe("validatedEvents");
});

it("shows the selected department and forwards its scope to the plant indicator charts", () => {
  render(createElement(CorporatePlantManager, {
    initialPlants: [plant], totalPlants: 1, totalValidatedEvents: 1, totalOpenActions: 99,
    totalClosedActions: 0, totalActionsToClose: 99, totalClosedActionsPercent: 0,
    totalActionsToClosePercent: 100, totalNearMisses: 1, totalInjuries: 0, totalRootCauses: 0,
    totalFrequencyIndex: 0, totalSeverityIndex: 0, totalCommunicationPyramid: plant.communicationPyramid,
    rankings: [], initialActivePlantCode: "pl01", hidePlantList: true, hideFavoriteMetrics: true,
    hidePyramid: true, departmentScope: true, scopeLabelOverride: "Plant / Production", labels,
  }));
  expect(screen.getByText(`${labels.scope}: Plant / Production`)).toBeTruthy();
  expect(screen.queryByRole("option", { name: labels.openActions })).toBeNull();
});
