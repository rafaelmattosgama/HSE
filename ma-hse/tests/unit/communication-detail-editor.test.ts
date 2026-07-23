// @vitest-environment jsdom

import { CommunicationStatus, CommunicationType } from "@prisma/client";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommunicationDetailEditor } from "@/components/feature/communication-detail-editor";

const typeLabels = {
  UNSAFE_ACT: "Unsafe Act",
  UNSAFE_CONDITION: "Unsafe Condition",
  NEAR_MISS: "Near Miss",
  FIRST_AID: "First Aid",
  ACCIDENT: "Accident",
  FIVE_S_IMPROVEMENT: "5S Improvement",
  IMPROVEMENT_SUGGESTION: "Improvement Suggestion",
};

const baseCommunication = {
  id: "communication-1",
  codigoCompleto: "FA-PL01-2026-0001",
  codigoAbreviado: "FA-0001",
  type: CommunicationType.FIRST_AID,
  level: null,
  status: CommunicationStatus.SUBMITTED,
  eventDatetime: "2026-01-15T10:00:00.000Z",
  reporterName: "Ana Silva",
  reporterEmployeeNo: "1001",
  targetText: "Bruno Costa",
  targetEmployeeNo: "1002",
  targetEmployeeId: "employee-2",
  areaId: "area-1",
  workstationId: "workstation-1",
  equipmentId: null,
  riskThemeId: "risk-theme-1",
  unsafeActTypeId: "unsafe-act-1",
  unsafeConditionTypeId: null,
  nearMissTypeId: null,
  improvementSubtype: null,
  description: "Minor injury treated on site.",
  suggestedAction: null,
  severityPotential: null,
  isContractor: false,
  bodyPartId: "body-part-1",
  injuryTypeId: "injury-type-1",
  isFatal: false,
  initialLostDays: null,
  hasLeave: false,
  returnDate: null,
  linkedActionStatuses: [],
};

const baseProps = {
  plant: "pl01",
  communication: baseCommunication,
  canEdit: true,
  canManageStatus: false,
  canManageClassification: true,
  areas: [{ id: "area-1", name: "Production" }],
  workstations: [{ id: "workstation-1", name: "Line 1" }],
  equipments: [],
  riskThemes: [{ id: "risk-theme-1", name: "Mechanical risk" }],
  unsafeActTypes: [
    {
      id: "unsafe-act-1",
      name: "Procedure bypass",
      code: "UA-01",
      category: "Behavior",
    },
  ],
  unsafeConditionTypes: [],
  nearMissTypes: [],
  employees: [
    { id: "employee-1", name: "Ana Silva", employeeNo: "1001" },
    { id: "employee-2", name: "Bruno Costa", employeeNo: "1002" },
  ],
  bodyParts: [{ id: "body-part-1", name: "Head", code: "BP01" }],
  injuryTypes: [{ id: "injury-type-1", name: "Burn" }],
  actionOwners: [],
  typeLabels,
  statusLabel: "Submitted",
};

function selectContainingOption(value: string) {
  return screen
    .getAllByRole("combobox")
    .find((element) => element.querySelector(`option[value="${value}"]`)) as HTMLSelectElement | undefined;
}

function communicationForm() {
  return screen.getByRole("heading", { name: "Communication record" }).closest("form");
}

describe("CommunicationDetailEditor First Aid unsafe act type", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("does not render a stale unsafe act type for an existing First Aid record", () => {
    render(createElement(CommunicationDetailEditor, baseProps));

    expect(selectContainingOption("unsafe-act-1")).toBeUndefined();
  });

  it("keeps unsafe act type visible and required for Unsafe Act", () => {
    render(createElement(CommunicationDetailEditor, {
      ...baseProps,
      communication: {
        ...baseCommunication,
        type: CommunicationType.UNSAFE_ACT,
      },
    }));

    const unsafeActSelect = selectContainingOption("unsafe-act-1");
    expect(unsafeActSelect).toBeTruthy();
    expect(unsafeActSelect?.required).toBe(true);
  });

  it("clears the selected value when changing to First Aid and restores an empty field when leaving it", () => {
    render(createElement(CommunicationDetailEditor, {
      ...baseProps,
      communication: {
        ...baseCommunication,
        type: CommunicationType.UNSAFE_ACT,
      },
    }));

    const typeSelect = selectContainingOption("FIRST_AID");
    const unsafeActSelect = selectContainingOption("unsafe-act-1");
    expect(typeSelect).toBeTruthy();
    expect(unsafeActSelect?.value).toBe("unsafe-act-1");

    fireEvent.change(typeSelect!, { target: { value: CommunicationType.FIRST_AID } });
    expect(selectContainingOption("unsafe-act-1")).toBeUndefined();

    fireEvent.change(typeSelect!, { target: { value: CommunicationType.UNSAFE_ACT } });
    expect(selectContainingOption("unsafe-act-1")?.value).toBe("");
  });

  it("omits unsafeActTypeId from the First Aid update payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(CommunicationDetailEditor, baseProps));
    fireEvent.submit(communicationForm()!);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(requestInit.body as string) as Record<string, unknown>;
    expect(Object.hasOwn(payload, "unsafeActTypeId")).toBe(false);
  });
});
