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
      showPendingValidationKpi: true,
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
        sifPsif: {
          plantName: "Plant A",
          current: {
            overall: { total: 2, sif: 1, psif: 0, sifOrPsif: 1, sifPercent: 50, psifPercent: 0, sifOrPsifPercent: 50 },
            byCategory: {
              FIRST_AID: { total: 1, sif: 1, psif: 0, sifOrPsif: 1, sifPercent: 100, psifPercent: 0, sifOrPsifPercent: 100 },
              NEAR_MISS: { total: 1, sif: 0, psif: 0, sifOrPsif: 0, sifPercent: 0, psifPercent: 0, sifOrPsifPercent: 0 },
              ACCIDENT: { total: 0, sif: 0, psif: 0, sifOrPsif: 0, sifPercent: null, psifPercent: null, sifOrPsifPercent: null },
            },
          },
          comparisons: {},
        },
      },
    }));

    expect(screen.getByRole("heading", { name: labels.kpiSafetyOutcomes })).toBeTruthy();
    expect(screen.getByRole("heading", { name: labels.kpiLeadingIndicators })).toBeTruthy();
    expect(screen.getByRole("heading", { name: labels.kpiSifPsifIndicators })).toBeTruthy();
    expect(screen.getByRole("button", { name: `Definition: ${labels.kpiSifPsifIncidents}` })).toBeTruthy();
    // Regression: the SIF/PSIF category detail must render a plain middle dot and
    // em dash, not mojibake ("Â·" / "â€”") from a UTF-8 string double-encoded as CP1252.
    expect(screen.getByText("SIF: 1 (100.0%) · PSIF: 0 (0.0%) · 1 of 1 eligible incidents")).toBeTruthy();
    expect(screen.getByText("SIF: 0 (—) · PSIF: 0 (—) · 0 of 0 eligible incidents")).toBeTruthy();
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

  it("does not render the competence KPI group when the metric is omitted (module disabled or viewer not detailed)", () => {
    render(createElement(SafetyDashboardKpiGroups, {
      locale: "en",
      periodLabel: "2026-01-01 - 2026-08-18",
      labels,
      detailed: false,
      showPendingValidationKpi: false,
      canViewOpenCommunications: false,
      metrics: {
        validatedEvents: 0,
        injuries: 0,
        daysLost: 0,
        firstAids: 0,
        frequencyRate: null,
        gravityRate: null,
        firstAidRate: null,
        nearMisses: 0,
        unsafeActs: 0,
        unsafeConditions: 0,
        rootCauses: 0,
        openActions: 0,
        overdueActions: 0,
        closedOnTimePercent: null,
        unsafeActsClosedPercent: null,
        unsafeConditionsClosedPercent: null,
        pendingValidation: 0,
        openCommunications: 0,
        myOpenActions: 0,
        hoursWorked: null,
      },
    }));

    expect(screen.queryByRole("heading", { name: labels.kpiCompetenceAuthorizations })).toBeNull();
  });

  it("renders mandatory-authorization coverage and expired-count once the competence metric is provided", () => {
    render(createElement(SafetyDashboardKpiGroups, {
      locale: "en",
      periodLabel: "2026-01-01 - 2026-08-18",
      labels,
      detailed: true,
      showPendingValidationKpi: true,
      canViewOpenCommunications: true,
      metrics: {
        validatedEvents: 0,
        injuries: 0,
        daysLost: 0,
        firstAids: 0,
        frequencyRate: null,
        gravityRate: null,
        firstAidRate: null,
        nearMisses: 0,
        unsafeActs: 0,
        unsafeConditions: 0,
        rootCauses: 0,
        openActions: 0,
        overdueActions: 0,
        closedOnTimePercent: null,
        unsafeActsClosedPercent: null,
        unsafeConditionsClosedPercent: null,
        pendingValidation: 0,
        openCommunications: 0,
        myOpenActions: 0,
        hoursWorked: null,
        competences: {
          coveragePercent: 82.5,
          expiredCount: 3,
        },
      },
    }));

    expect(screen.getByRole("heading", { name: labels.kpiCompetenceAuthorizations })).toBeTruthy();
    expect(screen.getByText("82.5")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText(labels.kpiCompetenceCoverage)).toBeTruthy();
    expect(screen.getByText(labels.kpiCompetenceExpired)).toBeTruthy();
  });
});
