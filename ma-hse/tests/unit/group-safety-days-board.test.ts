// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GroupSafetyDaysBoard, type PlantSafetyDays } from "@/components/feature/group-safety-days-board";

function buildPlant(input: {
  id: string;
  code: string;
  name: string;
  currentDays: number;
  recordDays?: number;
  currentFrequencyIndex?: number | null;
  previousYearFrequencyIndex?: number | null;
}): PlantSafetyDays {
  return {
    id: input.id,
    code: input.code,
    name: input.name,
    currentFrequencyIndex: "currentFrequencyIndex" in input ? input.currentFrequencyIndex : 2.4,
    previousYearFrequencyIndex: "previousYearFrequencyIndex" in input ? input.previousYearFrequencyIndex : 3.2,
    safetyDays: {
      currentDays: input.currentDays,
      recordDays: input.recordDays ?? input.currentDays + 25,
      lastAccidentDate: "2026-05-01",
      source: "recorded",
      recordSource: "recorded",
      historicalRecordStartDate: null,
    },
  };
}

function getRenderedCards(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-testid="group-safety-plant-card"]'));
}

afterEach(() => {
  cleanup();
});

describe("GroupSafetyDaysBoard", () => {
  it("shows only the top 5 plants by default and keeps them sorted by current safety days", () => {
    const plants = [
      buildPlant({ id: "1", code: "p1", name: "Plant 1", currentDays: 14 }),
      buildPlant({ id: "2", code: "p2", name: "Plant 2", currentDays: 63 }),
      buildPlant({ id: "3", code: "p3", name: "Plant 3", currentDays: 29 }),
      buildPlant({ id: "4", code: "p4", name: "Plant 4", currentDays: 91 }),
      buildPlant({ id: "5", code: "p5", name: "Plant 5", currentDays: 55 }),
      buildPlant({ id: "6", code: "p6", name: "Plant 6", currentDays: 120 }),
      buildPlant({ id: "7", code: "p7", name: "Plant 7", currentDays: 8 }),
    ];

    const { container } = render(createElement(GroupSafetyDaysBoard, { plants }));
    const cards = getRenderedCards(container);

    expect(cards).toHaveLength(5);
    expect(cards.map((card) => within(card).getByTestId("group-safety-plant-name").textContent)).toEqual([
      "Plant 6",
      "Plant 4",
      "Plant 2",
      "Plant 5",
      "Plant 3",
    ]);
    expect(screen.getByRole("button", { name: "Show all plants" })).toBeTruthy();
  });

  it("expands to all plants and collapses back to the top 5", () => {
    const plants = Array.from({ length: 6 }, (_, index) =>
      buildPlant({
        id: String(index + 1),
        code: `p${index + 1}`,
        name: `Plant ${index + 1}`,
        currentDays: 100 - index,
      }),
    );

    const { container } = render(createElement(GroupSafetyDaysBoard, { plants }));

    fireEvent.click(screen.getByRole("button", { name: "Show all plants" }));
    expect(getRenderedCards(container)).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Show top 5" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show top 5" }));
    expect(getRenderedCards(container)).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Show all plants" })).toBeTruthy();
  });

  it("renders improvement, worsening, neutral, and N/A comparison states with the expected formatting", () => {
    const plants = [
      buildPlant({
        id: "1",
        code: "improved",
        name: "Improved",
        currentDays: 100,
        currentFrequencyIndex: 2.4,
        previousYearFrequencyIndex: 3.0,
      }),
      buildPlant({
        id: "2",
        code: "worsened",
        name: "Worsened",
        currentDays: 90,
        currentFrequencyIndex: 3.5,
        previousYearFrequencyIndex: 3.0,
      }),
      buildPlant({
        id: "3",
        code: "neutral",
        name: "Neutral",
        currentDays: 80,
        currentFrequencyIndex: 3.0,
        previousYearFrequencyIndex: 3.0,
      }),
      buildPlant({
        id: "4",
        code: "zero",
        name: "Zero previous",
        currentDays: 70,
        currentFrequencyIndex: 3.0,
        previousYearFrequencyIndex: 0,
      }),
      buildPlant({
        id: "5",
        code: "null",
        name: "Null previous",
        currentDays: 60,
        currentFrequencyIndex: 3.0,
        previousYearFrequencyIndex: null,
      }),
      buildPlant({
        id: "6",
        code: "undefined",
        name: "Undefined previous",
        currentDays: 50,
        currentFrequencyIndex: 3.0,
        previousYearFrequencyIndex: undefined,
      }),
    ];

    const { container } = render(createElement(GroupSafetyDaysBoard, { plants }));
    fireEvent.click(screen.getByRole("button", { name: "Show all plants" }));

    const cards = getRenderedCards(container);
    const improvedChange = within(cards[0]).getByTestId("group-safety-frequency-change");
    const worsenedChange = within(cards[1]).getByTestId("group-safety-frequency-change");
    const neutralChange = within(cards[2]).getByTestId("group-safety-frequency-change");
    const zeroPreviousChange = within(cards[3]).getByTestId("group-safety-frequency-change");
    const nullPreviousChange = within(cards[4]).getByTestId("group-safety-frequency-change");
    const undefinedPreviousChange = within(cards[5]).getByTestId("group-safety-frequency-change");

    expect(improvedChange.textContent).toBe("-20.0%");
    expect(improvedChange.className).toContain("text-emerald-600");

    expect(worsenedChange.textContent).toBe("+16.7%");
    expect(worsenedChange.className).toContain("text-rose-600");

    expect(neutralChange.textContent).toBe("0.0%");
    expect(neutralChange.className).toContain("text-slate-500");

    expect(zeroPreviousChange.textContent).toBe("N/A");
    expect(zeroPreviousChange.className).toContain("text-slate-500");

    expect(nullPreviousChange.textContent).toBe("N/A");
    expect(nullPreviousChange.className).toContain("text-slate-500");

    expect(undefinedPreviousChange.textContent).toBe("N/A");
    expect(undefinedPreviousChange.className).toContain("text-slate-500");
  });

  it("renders safely when there are fewer than 5 plants", () => {
    const plants = [
      buildPlant({ id: "1", code: "p1", name: "Plant 1", currentDays: 18 }),
      buildPlant({ id: "2", code: "p2", name: "Plant 2", currentDays: 36 }),
      buildPlant({ id: "3", code: "p3", name: "Plant 3", currentDays: 24 }),
    ];

    const { container } = render(createElement(GroupSafetyDaysBoard, { plants }));

    expect(getRenderedCards(container)).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Show all plants" })).toBeNull();
  });
});
