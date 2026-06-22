import { CommunicationType, RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({
  requirePlantAccess: vi.fn(),
}));

const plantMock = vi.hoisted(() => ({
  getPlantByCode: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  communication: {
    findFirst: vi.fn(),
  },
}));

const exportMock = vi.hoisted(() => ({
  CommunicationReportExportService: {
    buildPdf: vi.fn(),
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
vi.mock("@/lib/services/communication-report-export", () => exportMock);
vi.mock("@/lib/server-ui-language", () => uiLanguageMock);
vi.mock("@/lib/logger", () => loggerMock);

import { GET } from "@/app/api/plants/[plantCode]/communications/[id]/report/route";

function routeContext() {
  return {
    params: Promise.resolve({ plantCode: "maap", id: "comm-1" }),
  };
}

describe("communication report route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a PDF attachment for supported communication types", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-1", language: "pt" } },
      role: RoleCode.N3_SAFETY,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1", defaultLanguage: "pt" });
    prismaMock.communication.findFirst.mockResolvedValue({
      id: "comm-1",
      type: CommunicationType.UNSAFE_ACT,
      codigoCompleto: "UA_MAAP_2026_78",
      codigoAbreviado: null,
    });
    uiLanguageMock.getServerUiLocale.mockResolvedValue("pt");
    exportMock.CommunicationReportExportService.buildPdf.mockResolvedValue(Buffer.from([1, 2, 3]));

    const response = (await GET(
      new Request("http://localhost/api/plants/maap/communications/comm-1/report"),
      routeContext(),
    ))!;

    expect(exportMock.CommunicationReportExportService.buildPdf).toHaveBeenCalledWith("comm-1", { locale: "pt" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("comunicacao-seguranca-UA_MAAP_2026_78.pdf");
    const data = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(data)).toEqual([1, 2, 3]);
  });

  it("rejects unsupported communication types before generating the PDF", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-1", language: "pt" } },
      role: RoleCode.N3_SAFETY,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1", defaultLanguage: "pt" });
    prismaMock.communication.findFirst.mockResolvedValue({
      id: "comm-1",
      type: CommunicationType.NEAR_MISS,
      codigoCompleto: "NM_MAAP_2026_10",
      codigoAbreviado: null,
    });

    const response = (await GET(
      new Request("http://localhost/api/plants/maap/communications/comm-1/report"),
      routeContext(),
    ))!;

    expect(response.status).toBe(400);
    expect(exportMock.CommunicationReportExportService.buildPdf).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      ok: false,
      errorCode: "COMMUNICATION_REPORT_UNSUPPORTED_TYPE",
    });
  });

  it("returns a controlled error when PDF generation fails", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-1", language: "pt" } },
      role: RoleCode.N3_SAFETY,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1", defaultLanguage: "pt" });
    prismaMock.communication.findFirst.mockResolvedValue({
      id: "comm-1",
      type: CommunicationType.UNSAFE_CONDITION,
      codigoCompleto: "UC_MAAP_2026_11",
      codigoAbreviado: null,
    });
    uiLanguageMock.getServerUiLocale.mockResolvedValue("pt");
    const generationError = new Error("PDF failed");
    exportMock.CommunicationReportExportService.buildPdf.mockRejectedValue(generationError);

    const response = (await GET(
      new Request("http://localhost/api/plants/maap/communications/comm-1/report"),
      routeContext(),
    ))!;

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      ok: false,
      errorCode: "COMMUNICATION_REPORT_EXPORT_FAILED",
    });
    expect(loggerMock.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: generationError,
        communicationId: "comm-1",
      }),
      "failed_to_export_communication_report",
    );
  });
});
