import { MasterDataEntityType, MasterDataTranslationField, RoleCode } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({ requirePlantAccess: vi.fn() }));
const plantMock = vi.hoisted(() => ({ getPlantByCode: vi.fn() }));
const serviceMock = vi.hoisted(() => ({
  getMasterDataTranslationState: vi.fn(),
  saveManualMasterDataTranslation: vi.fn(),
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/services/master-data-translation-service", () => serviceMock);

import { GET, PATCH } from "@/app/api/plants/[plantCode]/admin/master-data/translations/route";

const context = { params: Promise.resolve({ plantCode: "pt11" }) };

describe("master data translation administration route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "admin-1", language: "en" } },
      role: RoleCode.N0_ADMIN,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
  });

  it("does not expose or alter an item from another plant", async () => {
    serviceMock.getMasterDataTranslationState.mockResolvedValue({
      snapshot: {
        id: "11111111-1111-4111-8111-111111111111",
        plantId: "plant-2",
        sourceLanguage: "pt",
        plantLanguage: "pt",
        fields: [],
      },
      translations: [],
    });

    const response = await PATCH(
      new Request("http://localhost/api/plants/pt11/admin/master-data/translations", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entityType: MasterDataEntityType.AREA,
          entityId: "11111111-1111-4111-8111-111111111111",
          field: MasterDataTranslationField.NAME,
          locale: "en",
          value: "Production",
        }),
      }),
      context,
    );

    if (!response) throw new Error("Expected a response");
    expect(response.status).toBe(404);
    expect(serviceMock.saveManualMasterDataTranslation).not.toHaveBeenCalled();
  });

  it("returns original and localized translation state for the selected plant", async () => {
    serviceMock.getMasterDataTranslationState.mockResolvedValue({
      snapshot: {
        id: "11111111-1111-4111-8111-111111111111",
        plantId: "plant-1",
        sourceLanguage: "pt",
        plantLanguage: "pt",
        fields: [{ field: MasterDataTranslationField.NAME, value: "Produção" }],
      },
      translations: [{ locale: "en", value: "Production" }],
    });

    const response = await GET(
      new Request("http://localhost/api/plants/pt11/admin/master-data/translations?entityType=AREA&entityId=11111111-1111-4111-8111-111111111111"),
      context,
    );
    if (!response) throw new Error("Expected a response");
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.entity.original).toEqual({ name: "Produção" });
    expect(json.data.translations).toEqual([{ locale: "en", value: "Production" }]);
  });
});
