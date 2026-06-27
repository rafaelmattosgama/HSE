// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateCommunicationQuick } from "@/components/feature/create-communication-quick";

const navigationMock = vi.hoisted(() => ({
  usePathname: vi.fn(),
}));

vi.mock("next/navigation", () => navigationMock);

const baseProps = {
  areas: [{ id: "area-1", name: "Production" }],
  workstations: [{ id: "workstation-1", name: "Line 1" }],
  actionOwners: [],
  employees: [{ id: "employee-1", name: "Ana Silva", employeeNo: "1001" }],
  bodyParts: [],
  injuryTypes: [],
  riskThemes: [],
  unsafeActTypes: [],
  unsafeConditionTypes: [],
  nearMissTypes: [],
  canLinkAction: false,
  canManageClassification: false,
};

describe("CreateCommunicationQuick", () => {
  beforeEach(() => {
    navigationMock.usePathname.mockReturnValue("/app/pl1/communications");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("starts collapsed and toggles the quick communication form", () => {
    render(createElement(CreateCommunicationQuick, baseProps));

    expect(screen.getByText("Quick communication")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Create" })).toBeNull();

    const expandButton = screen.getByRole("button", { name: "Show" });
    expect(expandButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(expandButton);

    const collapseButton = screen.getByRole("button", { name: "Hide" });
    expect(collapseButton.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Create" })).toBeTruthy();

    fireEvent.click(collapseButton);

    expect(screen.getByRole("button", { name: "Show" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "Create" })).toBeNull();
  });

  it("keeps entered data when collapsed and expanded again", () => {
    render(createElement(CreateCommunicationQuick, baseProps));

    fireEvent.click(screen.getByRole("button", { name: "Show" }));

    const descriptionInput = screen.getByPlaceholderText("Description") as HTMLTextAreaElement;
    fireEvent.change(descriptionInput, { target: { value: "Observed guard missing on conveyor." } });

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    fireEvent.click(screen.getByRole("button", { name: "Show" }));

    expect((screen.getByPlaceholderText("Description") as HTMLTextAreaElement).value).toBe("Observed guard missing on conveyor.");
  });
});
