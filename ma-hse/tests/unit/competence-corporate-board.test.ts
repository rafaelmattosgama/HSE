// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CompetenceCorporateBoard, type PlantCompetenceCoverage } from "@/components/feature/competence-corporate-board";

function buildPlant(input: {
  id: string;
  code: string;
  name: string;
  coveragePercent: number | null;
  expiredCount?: number;
}): PlantCompetenceCoverage {
  const coveragePercent = input.coveragePercent;
  const validCount = coveragePercent === null ? 0 : Math.round(coveragePercent);
  return {
    id: input.id,
    code: input.code,
    name: input.name,
    requiredTotal: coveragePercent === null ? 0 : 100,
    validCount,
    coveragePercent,
    expiredCount: input.expiredCount ?? 0,
  };
}

function getRenderedCards(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-testid="competence-corporate-plant-card"]'));
}

afterEach(() => {
  cleanup();
});

describe("CompetenceCorporateBoard", () => {
  it("shows only the top 5 plants by default, worst coverage first", () => {
    const plants = [
      buildPlant({ id: "1", code: "p1", name: "Plant 1", coveragePercent: 95 }),
      buildPlant({ id: "2", code: "p2", name: "Plant 2", coveragePercent: 40 }),
      buildPlant({ id: "3", code: "p3", name: "Plant 3", coveragePercent: 70 }),
      buildPlant({ id: "4", code: "p4", name: "Plant 4", coveragePercent: 10 }),
      buildPlant({ id: "5", code: "p5", name: "Plant 5", coveragePercent: 60 }),
      buildPlant({ id: "6", code: "p6", name: "Plant 6", coveragePercent: 20 }),
      buildPlant({ id: "7", code: "p7", name: "Plant 7", coveragePercent: 99 }),
    ];

    const { container } = render(createElement(CompetenceCorporateBoard, { plants }));
    const cards = getRenderedCards(container);

    expect(cards).toHaveLength(5);
    expect(cards.map((card) => within(card).getByTestId("competence-corporate-plant-name").textContent)).toEqual([
      "Plant 4",
      "Plant 6",
      "Plant 2",
      "Plant 5",
      "Plant 3",
    ]);
    expect(screen.getByRole("button", { name: "Show all plants" })).toBeTruthy();
  });

  it("sorts plants with no mandatory requirement (null coverage) after every plant with a real gap", () => {
    const plants = [
      buildPlant({ id: "1", code: "p1", name: "No requirements", coveragePercent: null }),
      buildPlant({ id: "2", code: "p2", name: "Has a gap", coveragePercent: 30 }),
      buildPlant({ id: "3", code: "p3", name: "Full coverage", coveragePercent: 100 }),
    ];

    const { container } = render(createElement(CompetenceCorporateBoard, { plants }));
    const cards = getRenderedCards(container);

    expect(cards.map((card) => within(card).getByTestId("competence-corporate-plant-name").textContent)).toEqual([
      "Has a gap",
      "Full coverage",
      "No requirements",
    ]);
  });

  it("expands to all plants and collapses back to the top 5", () => {
    const plants = Array.from({ length: 6 }, (_, index) =>
      buildPlant({ id: String(index + 1), code: `p${index + 1}`, name: `Plant ${index + 1}`, coveragePercent: index * 10 }),
    );

    const { container } = render(createElement(CompetenceCorporateBoard, { plants }));

    fireEvent.click(screen.getByRole("button", { name: "Show all plants" }));
    expect(getRenderedCards(container)).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Show top 5" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show top 5" }));
    expect(getRenderedCards(container)).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Show all plants" })).toBeTruthy();
  });

  it("renders N/A for coverage and links each card to that plant's competences module", () => {
    const plants = [
      buildPlant({ id: "1", code: "acme", name: "Acme Plant", coveragePercent: null, expiredCount: 4 }),
    ];

    const { container } = render(createElement(CompetenceCorporateBoard, { plants }));
    const card = getRenderedCards(container)[0];

    expect(within(card).getByTestId("competence-corporate-coverage-value").textContent).toBe("Not applicable");
    expect(within(card).getByTestId("competence-corporate-expired-value").textContent).toBe("4");
    expect(card.getAttribute("href")).toBe("/app/acme/competences");
  });

  it("highlights the best-coverage plant and the plant with the most expired authorizations", () => {
    const plants = [
      buildPlant({ id: "1", code: "p1", name: "Best Plant", coveragePercent: 98, expiredCount: 0 }),
      buildPlant({ id: "2", code: "p2", name: "Worst Plant", coveragePercent: 20, expiredCount: 9 }),
    ];

    render(createElement(CompetenceCorporateBoard, { plants }));

    expect(screen.getAllByText("Best Plant").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Worst Plant").length).toBeGreaterThan(0);
    expect(screen.getByTestId("competence-corporate-best-coverage-value").textContent).toBe("98.0%");
    expect(screen.getByTestId("competence-corporate-most-expired-value").textContent).toBe("9");
  });

  it("renders safely when there are fewer than 5 plants", () => {
    const plants = [
      buildPlant({ id: "1", code: "p1", name: "Plant 1", coveragePercent: 50 }),
      buildPlant({ id: "2", code: "p2", name: "Plant 2", coveragePercent: 60 }),
    ];

    const { container } = render(createElement(CompetenceCorporateBoard, { plants }));

    expect(getRenderedCards(container)).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Show all plants" })).toBeNull();
  });
});
