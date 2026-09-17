// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SafetyCommunicationPyramid } from "@/components/feature/safety-communication-pyramid";

const counts = {
  fatal: 0,
  seriousInjury: 0,
  minorInjury: 0,
  firstAid: 1,
  nearMiss: 0,
  unsafeCondition: 0,
  unsafeAct: 0,
};

function renderPyramid() {
  return render(createElement(SafetyCommunicationPyramid, {
    title: "Safety Communication Pyramid",
    counts,
    scopeLabel: "Valença - MAAP",
    periodLabel: "2026-01-01 - 2026-12-31",
  }));
}

describe("SafetyCommunicationPyramid em coluna estreita", () => {
  afterEach(cleanup);

  it("divide banda e métricas pelo contentor, não pelo viewport", () => {
    const { container } = renderPyramid();
    // Comparar token a token: "@md:grid-cols-…" contém "md:grid-cols-…" como substring,
    // por isso uma verificação por substring nunca distinguiria os dois casos.
    const classTokens = Array.from(container.querySelectorAll("*"))
      .flatMap((element) => element.getAttribute("class")?.split(/\s+/) ?? []);

    expect(classTokens.some((token) => token.startsWith("@sm:grid-cols-"))).toBe(true);
    expect(classTokens.some((token) => token.startsWith("md:grid-cols-"))).toBe(false);
    expect(classTokens.some((token) => token.startsWith("md:w-"))).toBe(false);
    expect(classTokens.some((token) => token.startsWith("md:flex-row"))).toBe(false);
  });

  it("declara-se como contentor de consulta", () => {
    const { container } = renderPyramid();
    expect(container.querySelector('[class*="@container"]')).toBeTruthy();
  });

  it("continua a mostrar todas as camadas", () => {
    const { container } = renderPyramid();
    for (const key of ["fatal", "seriousInjury", "minorInjury", "firstAid", "nearMiss", "unsafeCondition", "unsafeAct"]) {
      expect(container.querySelector(`[data-testid="pyramid-band-${key}"]`)).toBeTruthy();
    }
  });
});
