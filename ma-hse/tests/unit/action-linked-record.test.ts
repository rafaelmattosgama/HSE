import { describe, expect, it } from "vitest";
import {
  getActionLinkedRecordCodes,
  getActionLinkedRecordDescription,
} from "@/lib/action-linked-record";

describe("action linked record helpers", () => {
  it("resolves communication description and readable code", () => {
    const action = {
      sourceType: "COMMUNICATION",
      communicationId: "technical-id",
      communication: {
        id: "technical-id",
        description: "Communication description",
        codigoCompleto: "UC_MAAP_2026_01",
        codigoAbreviado: "#202601",
      },
      sewo: null,
    };

    expect(getActionLinkedRecordDescription(action)).toBe("Communication description");
    expect(getActionLinkedRecordCodes(action)).toEqual({
      communicationCode: "UC_MAAP_2026_01",
      sewoCode: "-",
    });
  });

  it("resolves S-EWO description and readable code", () => {
    const action = {
      sourceType: "SEWO",
      sewoId: "technical-id",
      communication: null,
      sewo: {
        id: "technical-id",
        howText: "S-EWO occurrence description",
        codigoSewo: "sewo_MAAPUC202601",
      },
    };

    expect(getActionLinkedRecordDescription(action)).toBe("S-EWO occurrence description");
    expect(getActionLinkedRecordCodes(action)).toEqual({
      communicationCode: "-",
      sewoCode: "sewo_MAAPUC202601",
    });
  });

  it("falls back without exposing technical ids", () => {
    const action = {
      sourceType: "COMMUNICATION",
      communicationId: "488a9752-cd66-448a-b439-1ef6fe21a17f",
      communication: {
        id: "488a9752-cd66-448a-b439-1ef6fe21a17f",
        description: " ",
        codigoCompleto: null,
        codigoAbreviado: null,
      },
      sewo: null,
    };

    expect(getActionLinkedRecordDescription(action)).toBe("-");
    expect(getActionLinkedRecordCodes(action)).toEqual({
      communicationCode: "-",
      sewoCode: "-",
    });
  });
});
