// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SafetyDashboardKpiGroups } from "@/components/feature/safety-dashboard-kpi-groups";
import { getUiDictionary } from "@/lib/ui-language";

const labels = getUiDictionary("en").dashboard;
describe("SafetyDashboardKpiGroups", () => {
  afterEach(cleanup);

  it("groups detailed KPIs by operational purpose and distinguishes no-data from not-applicable values", () => {
    render(createElement(SafetyDashboardKpiGroups, {
      locale: "en",
      periodLabel: "2026-01-01 - 2026-08-18",
      labels,
      detailed: true,
      canViewValidation: true,
      canViewOpenCommunications: true,
      metrics: {
        validatedEvents: 12,
        injuries: 0,
        daysLost: 0,
        firstAids: 2,
        frequencyRate: null,
        gravityRate: 0,
        firstAidRate: null,
        nearMisses: 5,
        unsafeActs: 4,
        unsafeConditions: 3,
        rootCauses: 1,
        openActions: 2,
        overdueActions: 0,
        closedOnTimePercent: 100,
        unsafeActsClosedPercent: null,
        unsafeConditionsClosedPercent: 75,
        pendingValidation: 1,
        openCommunications: 3,
        myOpenActions: 1,
        hoursWorked: null,
        backlog: {
          total: 3,
          trend: [{ label: "Jan 2026", value: 1 }, { label: "Feb 2026", value: 3 }],
          ageing: { recent: 1, aging: 1, longRunning: 1 },
        },
      },
    }));

    expect(screen.getByRole("heading", { name: labels.kpiSafetyOutcomes })).toBeTruthy();
    expect(screen.getByRole("heading", { name: labels.kpiLeadingIndicators })).toBeTruthy();
    const exposureHeading = screen.getByRole("heading", { name: labels.kpiExposureScope });
    const actionsHeading = screen.getByRole("heading", { name: labels.kpiActionsCompliance });
    expect(exposureHeading.compareDocumentPosition(actionsHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(labels.kpiActionsClosedOnTime)).toBeTruthy();
    expect(screen.getByText(labels.kpiDaysLost)).toBeTruthy();
    expect(screen.getByText(labels.kpiFirstAids)).toBeTruthy();
    expect(screen.getByText(labels.kpiFirstAidsRate)).toBeTruthy();
    expect(screen.getByText(labels.kpiUnsafeActsClosed)).toBeTruthy();
    expect(screen.getByText(labels.kpiUnsafeConditionsClosed)).toBeTruthy();
    expect(screen.queryByText(labels.clinicalCases)).toBeNull();
    expect(screen.getAllByText(labels.kpiNoData).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(labels.kpiNotApplicable).length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText(labels.kpiCurrentStock).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: /Open action backlog: 3/i })).toBeTruthy();
    expect(screen.getByText(labels.kpiAgeOver60Days)).toBeTruthy();
    expect(screen.getByRole("button", { name: `Definition: ${labels.frequencyRate}` })).toBeTruthy();
  });
});
