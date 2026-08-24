// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ValidationQueue } from "@/components/feature/validation-queue";

vi.mock("@/components/feature/validation-actions", () => ({
  ValidationActions: () => null,
}));

const rows = [
  {
    id: "communication-ana-early",
    type: "UNSAFE_ACT",
    typeLabel: "Unsafe act",
    reporterName: "Ana Silva",
    eventDatetime: "2026-07-10T23:59:59.000Z",
    department: "Assembly",
    location: "Line 1",
    description: "Ana early communication",
  },
  {
    id: "communication-ana-late",
    type: "NEAR_MISS",
    typeLabel: "Near miss",
    reporterName: "Ana Silva",
    eventDatetime: "2026-07-18T08:00:00.000Z",
    department: "Assembly",
    location: "Line 2",
    description: "Ana late communication",
  },
  {
    id: "communication-bruno",
    type: "UNSAFE_ACT",
    typeLabel: "Unsafe act",
    reporterName: "Bruno Costa",
    eventDatetime: "2026-07-20T08:00:00.000Z",
    department: "Logistics",
    location: "Dock",
    description: "Bruno communication",
  },
  {
    id: "communication-anonymous",
    type: "FIRST_AID",
    typeLabel: "First aid",
    reporterName: "",
    eventDatetime: "2026-07-15T08:00:00.000Z",
    department: "Assembly",
    location: "Line 3",
    description: "Anonymous communication",
  },
];

describe("ValidationQueue", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("combines type, reporter and inclusive communication date filters", () => {
    render(createElement(ValidationQueue, { plant: "maap", rows }));

    fireEvent.change(screen.getByLabelText("Communication type"), { target: { value: "UNSAFE_ACT" } });
    fireEvent.change(screen.getByLabelText("Reporter"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-07-10" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-07-10" } });

    expect(screen.getByText("Ana early communication")).toBeTruthy();
    expect(screen.queryByText("Ana late communication")).toBeNull();
    expect(screen.queryByText("Bruno communication")).toBeNull();
    expect(screen.queryByText("Anonymous communication")).toBeNull();
  });

  it("keeps anonymous communications visible without a reporter selection and clears all filters", () => {
    const { container } = render(createElement(ValidationQueue, { plant: "maap", rows }));

    expect(screen.getByText("Anonymous communication")).toBeTruthy();
    expect(container.querySelectorAll("#validation-reporter-options option")).toHaveLength(3);

    fireEvent.change(screen.getByLabelText("Reporter"), { target: { value: "Ana Silva" } });
    expect(screen.queryByText("Anonymous communication")).toBeNull();

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-07-20" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-07-10" } });
    expect(screen.getByRole("alert").textContent).toContain("The start date must be before or equal to the end date.");

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("Anonymous communication")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByLabelText("Reporter") as HTMLInputElement).value).toBe("");
  });
});
