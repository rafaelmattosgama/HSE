import {
  MasterDataEntityType,
  MasterDataTranslationField,
  MasterDataTranslationStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  area: { findUnique: vi.fn(), update: vi.fn() },
  workstation: { findUnique: vi.fn(), update: vi.fn() },
  equipment: { findUnique: vi.fn(), update: vi.fn() },
  riskTheme: { findUnique: vi.fn(), update: vi.fn() },
  masterDataTranslation: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
}));

const providerMock = vi.hoisted(() => ({
  translateBatch: vi.fn(),
  detectLocales: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/services/translation-provider", () => ({
  getTranslationProvider: () => providerMock,
}));

import {
  applyMasterDataTranslations,
  hashMasterDataSource,
  localizeMasterDataRows,
  matchesMasterDataSearch,
  prepareMasterDataTranslations,
  processMasterDataTranslations,
} from "@/lib/services/master-data-translation-service";

function completed(entityId: string, field: MasterDataTranslationField, locale: string, value: string) {
  return { entityId, field, locale, value, status: MasterDataTranslationStatus.COMPLETED };
}

describe("master data translation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.masterDataTranslation.upsert.mockResolvedValue({});
    prismaMock.masterDataTranslation.update.mockResolvedValue({});
    prismaMock.masterDataTranslation.updateMany.mockResolvedValue({ count: 0 });
    providerMock.detectLocales.mockResolvedValue([]);
  });

  it("shows a Portuguese department in English and preserves its original name and code", () => {
    const [localized] = applyMasterDataTranslations({
      entityType: MasterDataEntityType.AREA,
      locale: "en",
      rows: [{ id: "area-1", code: "PT11", name: "Produção", sourceLanguage: "pt" }],
      translations: [completed("area-1", MasterDataTranslationField.NAME, "en", "Production")],
    });

    expect(localized).toMatchObject({
      id: "area-1",
      code: "PT11",
      name: "Production",
      localizedName: "Production",
      originalName: "Produção",
    });
  });

  it("shows an English location in Portuguese after an in-session locale change", () => {
    const row = { id: "ws-1", code: "WS01", name: "Finished goods warehouse", sourceLanguage: "en" };
    const translations = [completed("ws-1", MasterDataTranslationField.NAME, "pt", "Armazém de produto acabado")];

    const [english] = applyMasterDataTranslations({ entityType: MasterDataEntityType.WORKSTATION, rows: [row], locale: "en", translations });
    const [portuguese] = applyMasterDataTranslations({ entityType: MasterDataEntityType.WORKSTATION, rows: [row], locale: "pt", translations });

    expect(english.name).toBe("Finished goods warehouse");
    expect(portuguese.name).toBe("Armazém de produto acabado");
  });

  it("localizes equipment, risk name and risk category independently", () => {
    const [equipment] = applyMasterDataTranslations({
      entityType: MasterDataEntityType.EQUIPMENT,
      locale: "de",
      rows: [{ id: "eq-1", code: "E492", name: "Empilhador", sourceLanguage: "pt" }],
      translations: [completed("eq-1", MasterDataTranslationField.NAME, "de", "Gabelstapler")],
    });
    const [risk] = applyMasterDataTranslations({
      entityType: MasterDataEntityType.RISK_THEME,
      locale: "en",
      rows: [{ id: "risk-1", code: "PR-MEC-01", name: "Esmagamento", category: "Mechanical", sourceLanguage: "pt", categorySourceLanguage: "en" }],
      translations: [completed("risk-1", MasterDataTranslationField.NAME, "en", "Crushing")],
    });

    expect(equipment.name).toBe("Gabelstapler");
    expect(equipment.code).toBe("E492");
    expect(risk).toMatchObject({ name: "Crushing", category: "Mechanical", originalName: "Esmagamento" });
  });

  it("uses the configured fallback and never returns a blank value", () => {
    const localized = applyMasterDataTranslations({
      entityType: MasterDataEntityType.AREA,
      locale: "fr",
      rows: [
        { id: "a1", name: "Produção", sourceLanguage: "pt" },
        { id: "a2", name: "Logística", sourceLanguage: "pt" },
      ],
      translations: [completed("a1", MasterDataTranslationField.NAME, "en", "Production")],
    });

    expect(localized.find((row) => row.id === "a1")?.name).toBe("Production");
    expect(localized.find((row) => row.id === "a2")?.name).toBe("Logística");
  });

  it("searches by original name, localized name and stable code", () => {
    const row = { originalName: "Produção", localizedName: "Production", code: "PT11" };
    expect(matchesMasterDataSearch(row, "producao")).toBe(true);
    expect(matchesMasterDataSearch(row, "production")).toBe(true);
    expect(matchesMasterDataSearch(row, "PT11")).toBe(true);
    expect(matchesMasterDataSearch(row, "warehouse")).toBe(false);
  });

  it("loads translations in one query for a complete listing", async () => {
    prismaMock.masterDataTranslation.findMany.mockResolvedValue([]);
    const rows = Array.from({ length: 100 }, (_, index) => ({
      id: `area-${index}`,
      name: `Area ${index}`,
      sourceLanguage: "en",
    }));

    await localizeMasterDataRows(MasterDataEntityType.AREA, rows, "fr");

    expect(prismaMock.masterDataTranslation.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.masterDataTranslation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ entityId: { in: rows.map((row) => row.id) } }) }),
    );
  });

  it("is idempotent and does not recreate current translations on a second preparation", async () => {
    const sourceHash = hashMasterDataSource("Produção");
    prismaMock.area.findUnique.mockResolvedValue({
      id: "area-1",
      plantId: "plant-1",
      name: "Produção",
      sourceLanguage: "pt",
      plant: { defaultLanguage: "pt" },
    });
    prismaMock.masterDataTranslation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(
        ["pt", "it", "en", "pl", "de", "ro", "fr"].map((locale) => ({
          field: MasterDataTranslationField.NAME,
          locale,
          value: locale === "pt" ? "Produção" : `translated-${locale}`,
          sourceHash,
          status: MasterDataTranslationStatus.COMPLETED,
          isManual: false,
        })),
      );

    await prepareMasterDataTranslations({ entityType: MasterDataEntityType.AREA, entityId: "area-1" });
    expect(prismaMock.masterDataTranslation.upsert).toHaveBeenCalledTimes(7);
    prismaMock.masterDataTranslation.upsert.mockClear();
    await prepareMasterDataTranslations({ entityType: MasterDataEntityType.AREA, entityId: "area-1" });
    expect(prismaMock.masterDataTranslation.upsert).not.toHaveBeenCalled();
  });

  it("preserves a manually reviewed translation when the source is prepared again", async () => {
    prismaMock.area.findUnique.mockResolvedValue({
      id: "area-1",
      plantId: "plant-1",
      name: "Produção atualizada",
      sourceLanguage: "pt",
      plant: { defaultLanguage: "pt" },
    });
    prismaMock.masterDataTranslation.findMany.mockResolvedValue([{
      field: MasterDataTranslationField.NAME,
      locale: "fr",
      value: "Production révisée",
      sourceHash: hashMasterDataSource("Produção antiga"),
      status: MasterDataTranslationStatus.COMPLETED,
      isManual: true,
    }]);

    await prepareMasterDataTranslations({ entityType: MasterDataEntityType.AREA, entityId: "area-1" });

    expect(prismaMock.masterDataTranslation.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityType_entityId_field_locale: expect.objectContaining({ locale: "fr" }),
        }),
      }),
    );
  });

  it("detects the text language asynchronously instead of assuming the plant or UI language", async () => {
    prismaMock.area.findUnique
      .mockResolvedValueOnce({
        id: "area-1",
        plantId: "plant-1",
        name: "Produção",
        sourceLanguage: null,
        plant: { defaultLanguage: "en" },
      })
      .mockResolvedValueOnce({
        id: "area-1",
        plantId: "plant-1",
        name: "Produção",
        sourceLanguage: "pt",
        plant: { defaultLanguage: "en" },
      });
    prismaMock.masterDataTranslation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    providerMock.detectLocales.mockResolvedValue(["pt"]);

    await processMasterDataTranslations({
      entityType: MasterDataEntityType.AREA,
      entityId: "area-1",
    });

    expect(providerMock.detectLocales).toHaveBeenCalledWith(["Produção"]);
    expect(prismaMock.area.update).toHaveBeenCalledWith({
      where: { id: "area-1" },
      data: { sourceLanguage: "pt" },
    });
    expect(prismaMock.masterDataTranslation.updateMany).toHaveBeenCalledWith({
      where: {
        entityType: MasterDataEntityType.AREA,
        entityId: "area-1",
        field: { in: [MasterDataTranslationField.NAME] },
        isManual: false,
      },
      data: expect.objectContaining({
        value: null,
        status: MasterDataTranslationStatus.PENDING,
      }),
    });
  });

  it("detects professional risk names and categories independently", async () => {
    prismaMock.riskTheme.findUnique
      .mockResolvedValueOnce({
        id: "risk-1",
        plantId: "plant-1",
        name: "Esmagamento",
        category: "Mechanical",
        sourceLanguage: null,
        categorySourceLanguage: null,
        plant: { defaultLanguage: "fr" },
      })
      .mockResolvedValueOnce({
        id: "risk-1",
        plantId: "plant-1",
        name: "Esmagamento",
        category: "Mechanical",
        sourceLanguage: "pt",
        categorySourceLanguage: "en",
        plant: { defaultLanguage: "fr" },
      });
    prismaMock.masterDataTranslation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    providerMock.detectLocales.mockResolvedValue(["pt", "en"]);

    await processMasterDataTranslations({
      entityType: MasterDataEntityType.RISK_THEME,
      entityId: "risk-1",
    });

    expect(providerMock.detectLocales).toHaveBeenCalledWith(["Esmagamento", "Mechanical"]);
    expect(prismaMock.riskTheme.update).toHaveBeenCalledWith({
      where: { id: "risk-1" },
      data: { sourceLanguage: "pt", categorySourceLanguage: "en" },
    });
  });

  it("records provider failures without changing the original master data record", async () => {
    const sourceHash = hashMasterDataSource("Produção");
    const pending = {
      id: "translation-fr",
      entityId: "area-1",
      field: MasterDataTranslationField.NAME,
      locale: "fr",
      value: null,
      sourceHash,
      status: MasterDataTranslationStatus.PENDING,
      isManual: false,
    };
    prismaMock.area.findUnique.mockResolvedValue({
      id: "area-1",
      plantId: "plant-1",
      name: "Produção",
      sourceLanguage: "pt",
      plant: { defaultLanguage: "pt" },
    });
    prismaMock.masterDataTranslation.findMany
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([pending]);
    providerMock.translateBatch.mockRejectedValue(new Error("temporary outage"));

    await expect(
      processMasterDataTranslations({ entityType: MasterDataEntityType.AREA, entityId: "area-1" }),
    ).rejects.toBeInstanceOf(AggregateError);

    expect(prismaMock.area.update).not.toHaveBeenCalled();
    expect(prismaMock.masterDataTranslation.update).toHaveBeenCalledWith({
      where: { id: "translation-fr" },
      data: expect.objectContaining({
        status: MasterDataTranslationStatus.FAILED,
        attempts: { increment: 1 },
        lastError: "temporary outage",
      }),
    });
  });
});
