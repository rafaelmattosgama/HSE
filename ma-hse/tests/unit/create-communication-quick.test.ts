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

function selectContainingOption(value: string) {
  return screen
    .getAllByRole("combobox")
    .find((element) => element.querySelector(`option[value="${value}"]`)) as HTMLSelectElement | undefined;
}

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

  it("hides and clears unsafe act type when the communication changes to First Aid", () => {
    render(createElement(CreateCommunicationQuick, {
      ...baseProps,
      canManageClassification: true,
      unsafeActTypes: [{ id: "unsafe-act-1", name: "Procedure bypass", code: "UA-01", category: "Behavior" }],
    }));

    fireEvent.click(screen.getByRole("button", { name: "Show" }));

    const typeSelect = selectContainingOption("FIRST_AID");
    expect(typeSelect).toBeTruthy();
    fireEvent.change(typeSelect!, { target: { value: "UNSAFE_ACT" } });

    const unsafeActSelect = selectContainingOption("unsafe-act-1");
    expect(unsafeActSelect).toBeTruthy();
    fireEvent.change(unsafeActSelect!, { target: { value: "unsafe-act-1" } });
    expect(unsafeActSelect?.value).toBe("unsafe-act-1");

    fireEvent.change(typeSelect!, { target: { value: "FIRST_AID" } });
    expect(selectContainingOption("unsafe-act-1")).toBeUndefined();

    fireEvent.change(typeSelect!, { target: { value: "UNSAFE_ACT" } });
    expect(selectContainingOption("unsafe-act-1")?.value).toBe("");
  });

  it("sends eventDatetime as an unambiguous instant instead of the raw wall-clock string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(CreateCommunicationQuick, baseProps));
    fireEvent.click(screen.getByRole("button", { name: "Show" }));

    fireEvent.change(selectContainingOption("area-1")!, { target: { value: "area-1" } });
    fireEvent.change(selectContainingOption("workstation-1")!, { target: { value: "workstation-1" } });
    fireEvent.change(screen.getByLabelText("Date and time"), { target: { value: "2026-09-15T11:24" } });
    fireEvent.change(selectContainingOption("employee-1")!, { target: { value: "employee-1" } });
    fireEvent.change(screen.getByPlaceholderText("Description"), {
      target: { value: "Observed guard missing on conveyor." },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.eventDatetime).toBe(new Date("2026-09-15T11:24").toISOString());

    vi.unstubAllGlobals();
  });
});
