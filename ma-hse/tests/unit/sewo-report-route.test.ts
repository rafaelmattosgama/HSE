import { RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({
  requirePlantAccess: vi.fn(),
}));

const plantMock = vi.hoisted(() => ({
  getPlantByCode: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  sEWO: {
    findFirst: vi.fn(),
  },
}));

const exportMock = vi.hoisted(() => ({
  SewoExportService: {
    buildExport: vi.fn(),
    buildExternalSummaryExport: vi.fn(),
  },
}));

const uiLanguageMock = vi.hoisted(() => ({
  getServerUiLocale: vi.fn(),
}));

const loggerMock = vi.hoisted(() => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/services/sewo-export", () => exportMock);
vi.mock("@/lib/server-ui-language", () => uiLanguageMock);
vi.mock("@/lib/logger", () => loggerMock);

import { GET } from "@/app/api/plants/[plantCode]/sewo/[id]/report/route";

function routeContext() {
  return {
    params: Promise.resolve({ plantCode: "pl1", id: "sewo-1" }),
  };
}

describe("S-EWO report route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns PDF for summary reports and reuses external summary export logic", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-1", language: "en", name: "Ana Silva" } },
      role: RoleCode.N3_SAFETY,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1", defaultLanguage: "en" });
    prismaMock.sEWO.findFirst.mockResolvedValue({ id: "sewo-1" });
    uiLanguageMock.getServerUiLocale.mockResolvedValue("en");
    exportMock.SewoExportService.buildExternalSummaryExport.mockResolvedValue({ pdf: Buffer.from([1, 2, 3]) });

    const response = (await GET(
      new Request("http://localhost/api/plants/pl1/sewo/sewo-1/report?type=summary&format=pdf"),
      routeContext(),
    ))!;

    expect(exportMock.SewoExportService.buildExternalSummaryExport).toHaveBeenCalledWith("sewo-1", { locale: "en" });
    expect(exportMock.SewoExportService.buildExport).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("s-ewo-sewo-1.pdf");
    const data = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(data)).toEqual([1, 2, 3]);
  });

  it("returns PDF for complete reports and uses the standard export logic", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-1", language: "pt", name: "Ana Silva" } },
      role: RoleCode.N2_PLANT_MANAGER,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1", defaultLanguage: "pt" });
    prismaMock.sEWO.findFirst.mockResolvedValue({ id: "sewo-1" });
    uiLanguageMock.getServerUiLocale.mockResolvedValue("pt");
    exportMock.SewoExportService.buildExport.mockResolvedValue({ pdf: Buffer.from([4, 5, 6]), xlsx: Buffer.from([7, 8, 9]) });

    const response = (await GET(
      new Request("http://localhost/api/plants/pl1/sewo/sewo-1/report?type=complete&format=pdf"),
      routeContext(),
    ))!;

    expect(exportMock.SewoExportService.buildExport).toHaveBeenCalledWith("sewo-1", { locale: "pt", exportedBy: "Ana Silva", includeXlsx: false });
    expect(exportMock.SewoExportService.buildExternalSummaryExport).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("s-ewo-sewo-1.pdf");
    const data = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(data)).toEqual([4, 5, 6]);
  });

  it("still supports Excel for the standard full export when requested", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-1", language: "en", name: "Ana Silva" } },
      role: RoleCode.N2_PLANT_MANAGER,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1", defaultLanguage: "en" });
    prismaMock.sEWO.findFirst.mockResolvedValue({ id: "sewo-1" });
    uiLanguageMock.getServerUiLocale.mockResolvedValue("en");
    exportMock.SewoExportService.buildExport.mockResolvedValue({ pdf: Buffer.from([10]), xlsx: Buffer.from([11]) });

    const response = (await GET(
      new Request("http://localhost/api/plants/pl1/sewo/sewo-1/report?format=xlsx"),
      routeContext(),
    ))!;

    expect(exportMock.SewoExportService.buildExport).toHaveBeenCalledWith("sewo-1", { locale: "en", exportedBy: "Ana Silva" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(response.headers.get("content-disposition")).toContain("s-ewo-sewo-1.xlsx");
    const data = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(data)).toEqual([11]);
  });

  it("returns a controlled error when complete report generation fails", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-1", language: "pt", name: "Ana Silva" } },
      role: RoleCode.N2_PLANT_MANAGER,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1", defaultLanguage: "pt" });
    prismaMock.sEWO.findFirst.mockResolvedValue({ id: "sewo-1" });
    uiLanguageMock.getServerUiLocale.mockResolvedValue("pt");
    const generationError = new Error("PDF failed");
    exportMock.SewoExportService.buildExport.mockRejectedValue(generationError);

    const response = (await GET(
      new Request("http://localhost/api/plants/pl1/sewo/sewo-1/report?type=complete&format=pdf"),
      routeContext(),
    ))!;

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      ok: false,
      errorCode: "SEWO_REPORT_EXPORT_FAILED",
    });
    expect(loggerMock.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: generationError,
        errorName: "Error",
        errorMessage: "PDF failed",
        sewoId: "sewo-1",
        format: "pdf",
        reportType: "complete",
      }),
      "failed_to_export_sewo_report",
    );
  });
});
