import { RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  prisma: {
    reportRun: {
      findUnique: vi.fn(),
    },
  },
}));

const storageMock = vi.hoisted(() => ({
  StorageService: {
    getObjectBuffer: vi.fn(),
  },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/services/storage-service", () => storageMock);

import { GET } from "@/app/api/corporate/reports/[id]/pdf/route";

function routeContext() {
  return {
    params: Promise.resolve({ id: "report-1" }),
  };
}

describe("corporate report PDF route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("streams the report PDF through the app for N1 Corporate users", async () => {
    guardsMock.requireAuth.mockResolvedValue({
      session: { user: { plantRoles: [{ role: RoleCode.N1_CORPORATE, plantId: "plant-1", plantCode: "maap" }] } },
    });
    prismaMock.prisma.reportRun.findUnique.mockResolvedValue({
      fileKeys: { pdfKey: "corporate/reports/report-1.pdf", pdfFileName: "annual-report.pdf" },
    });
    storageMock.StorageService.getObjectBuffer.mockResolvedValue(Buffer.from([9, 9, 9]));

    const response = (await GET(new Request("http://localhost/api/report"), routeContext())) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="annual-report.pdf"');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([9, 9, 9]));
    expect(storageMock.StorageService.getObjectBuffer).toHaveBeenCalledWith({ key: "corporate/reports/report-1.pdf" });
  });

  it("rejects users without the N1 Corporate role", async () => {
    guardsMock.requireAuth.mockResolvedValue({
      session: { user: { plantRoles: [{ role: RoleCode.N3_SAFETY, plantId: "plant-1", plantCode: "maap" }] } },
    });

    const response = (await GET(new Request("http://localhost/api/report"), routeContext())) as Response;

    expect(response.status).toBe(403);
    expect(prismaMock.prisma.reportRun.findUnique).not.toHaveBeenCalled();
    expect(storageMock.StorageService.getObjectBuffer).not.toHaveBeenCalled();
  });

  it("returns 404 without touching storage when the report has no PDF yet", async () => {
    guardsMock.requireAuth.mockResolvedValue({
      session: { user: { plantRoles: [{ role: RoleCode.N1_CORPORATE, plantId: "plant-1", plantCode: "maap" }] } },
    });
    prismaMock.prisma.reportRun.findUnique.mockResolvedValue({ fileKeys: {} });

    const response = (await GET(new Request("http://localhost/api/report"), routeContext())) as Response;

    expect(response.status).toBe(404);
    expect(storageMock.StorageService.getObjectBuffer).not.toHaveBeenCalled();
  });
});
