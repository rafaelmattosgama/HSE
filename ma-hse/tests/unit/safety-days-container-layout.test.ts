// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SafetyDaysSpotlight } from "@/components/feature/safety-days-dashboard";
import { getUiDictionary } from "@/lib/ui-language";

const labels = getUiDictionary("en").dashboard;

const summary = {
  currentDays: 442,
  recordDays: 823,
  lastAccidentDate: "2025-07-02",
  recordSource: "historical" as const,
  historicalRecordStartDate: "2019-01-01",
};

function renderSpotlight() {
  return render(createElement(SafetyDaysSpotlight, {
    plantName: "Valença - MAAP",
    summary: summary as never,
    labels,
  }));
}

describe("SafetyDaysSpotlight em coluna estreita", () => {
  afterEach(cleanup);

  it("divide-se pelo contentor, não pelo viewport", () => {
    const { container } = renderSpotlight();
    expect(container.querySelector('[class*="@3xl:grid-cols"]')).toBeTruthy();
    expect(container.querySelector('[class*="lg:grid-cols"]')).toBeNull();
  });

  it("declara-se como contentor de consulta", () => {
    const { container } = renderSpotlight();
    expect(container.querySelector('[class*="@container"]')).toBeTruthy();
  });

  it("continua a mostrar os três números", () => {
    const { container } = renderSpotlight();
    expect(container.textContent).toContain("442");
    expect(container.textContent).toContain("823");
    expect(container.textContent).toContain("381");
  });
});
