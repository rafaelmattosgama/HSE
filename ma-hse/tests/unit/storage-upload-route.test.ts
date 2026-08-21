import { RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({
  requirePlantAccess: vi.fn(),
}));

const plantMock = vi.hoisted(() => ({
  getPlantByCode: vi.fn(),
}));

const storageMock = vi.hoisted(() => ({
  StorageService: {
    uploadObject: vi.fn(),
  },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/services/storage-service", () => storageMock);

import { POST } from "@/app/api/storage/upload/route";

function buildUploadRequest(fields: Record<string, string>, file?: File) {
  const formData = new FormData();
  if (file) formData.append("file", file);
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  return new Request("http://localhost/api/storage/upload", { method: "POST", body: formData });
}

describe("staff storage upload route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uploads the file through the app server instead of handing back a storage URL", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-1" } },
      role: RoleCode.N3_SAFETY,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    storageMock.StorageService.uploadObject.mockResolvedValue({ bucket: "ehs-attachments", key: "maap/sewo/generated-key.jpg" });

    const file = new File([Buffer.from("photo-bytes")], "evidence.jpg", { type: "image/jpeg" });
    const request = buildUploadRequest({ plantCode: "maap", folder: "sewo", contentType: "image/jpeg" }, file);

    const response = (await POST(request)) as Response;
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, data: { bucket: "ehs-attachments", key: "maap/sewo/generated-key.jpg" } });
    expect(storageMock.StorageService.uploadObject).toHaveBeenCalledTimes(1);
    const call = storageMock.StorageService.uploadObject.mock.calls[0][0];
    expect(call.contentType).toBe("image/jpeg");
    expect(call.body).toBeInstanceOf(Buffer);
    expect(call.body.toString()).toBe("photo-bytes");
    expect(guardsMock.requirePlantAccess).toHaveBeenCalledWith(
      "maap",
      expect.arrayContaining([RoleCode.N0_ADMIN, RoleCode.MEDICO, RoleCode.N1_CORPORATE]),
    );
  });

  it("rejects requests without a file before touching storage or auth", async () => {
    const request = buildUploadRequest({ plantCode: "maap", folder: "sewo", contentType: "image/jpeg" });

    const response = (await POST(request)) as Response;

    expect(response.status).toBe(422);
    expect(guardsMock.requirePlantAccess).not.toHaveBeenCalled();
    expect(storageMock.StorageService.uploadObject).not.toHaveBeenCalled();
  });

  it("rejects files over the size limit", async () => {
    const oversized = new File([new Uint8Array(16 * 1024 * 1024)], "huge.jpg", { type: "image/jpeg" });
    const request = buildUploadRequest({ plantCode: "maap", folder: "sewo", contentType: "image/jpeg" }, oversized);

    const response = (await POST(request)) as Response;

    expect(response.status).toBe(413);
    expect(storageMock.StorageService.uploadObject).not.toHaveBeenCalled();
  });

  it("rejects an unrecognized folder", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-1" } },
      role: RoleCode.N3_SAFETY,
    });
    const file = new File([Buffer.from("x")], "evidence.jpg", { type: "image/jpeg" });
    const request = buildUploadRequest({ plantCode: "maap", folder: "not-a-real-folder", contentType: "image/jpeg" }, file);

    const response = (await POST(request)) as Response;

    expect(response.status).toBe(422);
    expect(storageMock.StorageService.uploadObject).not.toHaveBeenCalled();
  });

  it("propagates the RBAC rejection when the user lacks plant access", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      error: new Response(JSON.stringify({ ok: false, errorCode: "FORBIDDEN" }), { status: 403 }),
    });
    const file = new File([Buffer.from("x")], "evidence.jpg", { type: "image/jpeg" });
    const request = buildUploadRequest({ plantCode: "maap", folder: "sewo", contentType: "image/jpeg" }, file);

    const response = (await POST(request)) as Response;

    expect(response.status).toBe(403);
    expect(storageMock.StorageService.uploadObject).not.toHaveBeenCalled();
  });
});
