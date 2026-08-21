import { RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({
  requirePlantAccess: vi.fn(),
}));

const plantMock = vi.hoisted(() => ({
  getPlantByCode: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  prisma: {
    mapDocument: {
      findFirst: vi.fn(),
    },
  },
}));

const storageMock = vi.hoisted(() => ({
  StorageService: {
    getObjectBuffer: vi.fn(),
  },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/services/storage-service", () => storageMock);

import { GET } from "@/app/api/plants/[plantCode]/mapa/documents/[id]/route";

function routeContext() {
  return {
    params: Promise.resolve({ plantCode: "maap", id: "document-1" }),
  };
}

describe("map document route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("streams the map document through the app instead of an internal storage URL", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-1" } },
      role: RoleCode.N3_SAFETY,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.mapDocument.findFirst.mockResolvedValue({
      fileKey: "maap/maps/layout.pdf",
      fileName: "layout.pdf",
      contentType: "application/pdf",
    });
    storageMock.StorageService.getObjectBuffer.mockResolvedValue(Buffer.from([1, 2, 3]));

    const response = (await GET(new Request("http://localhost/api/document"), routeContext())) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="layout.pdf"');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(storageMock.StorageService.getObjectBuffer).toHaveBeenCalledWith({ key: "maap/maps/layout.pdf" });
    expect(prismaMock.prisma.mapDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "document-1", plantId: "plant-1" } }),
    );
  });

  it("returns 404 without touching storage when the document does not belong to the plant", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-1" } },
      role: RoleCode.N3_SAFETY,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.mapDocument.findFirst.mockResolvedValue(null);

    const response = (await GET(new Request("http://localhost/api/document"), routeContext())) as Response;

    expect(response.status).toBe(404);
    expect(storageMock.StorageService.getObjectBuffer).not.toHaveBeenCalled();
  });
});
