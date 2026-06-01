import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/viewer-translation-service", () => ({
  translateForViewer: vi.fn(async (_locale: string, texts: Array<string | null | undefined>) =>
    texts.map((text) => (text ? `pt:${text}` : "")),
  ),
}));

import {
  localizeCommunicationCatalogRows,
  localizeCommunicationCategorizedCatalogRows,
} from "@/lib/services/communication-catalog-localization";

describe("communication catalog localization", () => {
  it("localizes and sorts named catalog rows", async () => {
    const rows = [
      { id: "2", name: "Zulu" },
      { id: "1", name: "Alpha" },
    ];

    const localized = await localizeCommunicationCatalogRows(rows, "fr");

    expect(localized).toEqual([
      { id: "1", name: "pt:Alpha" },
      { id: "2", name: "pt:Zulu" },
    ]);
  });

  it("localizes names and categories for categorized rows", async () => {
    const rows = [
      { id: "2", code: "B", category: "Machines", name: "Breaker" },
      { id: "1", code: "A", category: "Acts", name: "Bypass" },
    ];

    const localized = await localizeCommunicationCategorizedCatalogRows(rows, "fr");

    expect(localized).toEqual([
      { id: "1", code: "A", category: "pt:Acts", name: "pt:Bypass" },
      { id: "2", code: "B", category: "pt:Machines", name: "pt:Breaker" },
    ]);
  });

  it("uses fixed Portuguese translations for default unsafe condition options", async () => {
    const rows = [
      {
        id: "1",
        code: "UC-FAC-01",
        category: "FACILITIES / EQUIPMENT",
        name: "Anomalous functioning of equipment / facilities",
      },
    ];

    const localized = await localizeCommunicationCategorizedCatalogRows(rows, "pt");

    expect(localized).toEqual([
      {
        id: "1",
        code: "UC-FAC-01",
        category: "INSTALACOES / EQUIPAMENTOS",
        name: "Funcionamento anomalo de equipamentos / instalacoes",
      },
    ]);
  });
});
