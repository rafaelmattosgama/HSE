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
    communicationAttachment: {
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

import { GET } from "@/app/api/plants/[plantCode]/communications/[id]/attachments/[attachmentId]/route";

function routeContext() {
  return {
    params: Promise.resolve({
      plantCode: "maap",
      id: "communication-1",
      attachmentId: "attachment-1",
    }),
  };
}

describe("communication attachment route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("streams the attachment through the app instead of redirecting to the internal S3 endpoint", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: {
        user: {
          id: "user-1",
        },
      },
      role: RoleCode.N3_SAFETY,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.communicationAttachment.findFirst.mockResolvedValue({
      fileKey: "maap/communications/public-reports/photo.jpg",
      fileName: "photo.jpg",
      contentType: "image/jpeg",
    });
    storageMock.StorageService.getObjectBuffer.mockResolvedValue(Buffer.from([1, 2, 3]));

    const response = (await GET(new Request("http://localhost/api/attachment"), routeContext())) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="photo.jpg"');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(storageMock.StorageService.getObjectBuffer).toHaveBeenCalledWith({
      key: "maap/communications/public-reports/photo.jpg",
    });
  });
});
