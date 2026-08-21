import { afterEach, describe, expect, it, vi } from "vitest";

const contractorAuthMock = vi.hoisted(() => ({
  getContractorSessionCompany: vi.fn(),
}));

const storageMock = vi.hoisted(() => ({
  StorageService: {
    uploadObject: vi.fn(),
  },
}));

vi.mock("@/lib/contractor-auth", () => contractorAuthMock);
vi.mock("@/lib/services/storage-service", () => storageMock);

import { POST } from "@/app/api/contractors/storage/upload/route";

function buildUploadRequest(fields: Record<string, string>, file?: File) {
  const formData = new FormData();
  if (file) formData.append("file", file);
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  return new Request("http://localhost/api/contractors/storage/upload", { method: "POST", body: formData });
}

describe("contractor storage upload route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uploads on behalf of the authenticated contractor company, ignoring any client-sent plant code", async () => {
    contractorAuthMock.getContractorSessionCompany.mockResolvedValue({
      id: "company-1",
      plant: { code: "maap" },
    });
    storageMock.StorageService.uploadObject.mockResolvedValue({ bucket: "ehs-attachments", key: "maap/communications/doc.pdf" });

    const file = new File([Buffer.from("doc-bytes")], "insurance.pdf", { type: "application/pdf" });
    const request = buildUploadRequest({ plantCode: "some-other-plant", folder: "communications", contentType: "application/pdf" }, file);

    const response = (await POST(request)) as Response;
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, data: { bucket: "ehs-attachments", key: "maap/communications/doc.pdf" } });
    const call = storageMock.StorageService.uploadObject.mock.calls[0][0];
    expect(call.key.startsWith("maap/communications/")).toBe(true);
  });

  it("rejects unauthenticated contractor requests before touching storage", async () => {
    contractorAuthMock.getContractorSessionCompany.mockResolvedValue(null);
    const file = new File([Buffer.from("x")], "doc.pdf", { type: "application/pdf" });
    const request = buildUploadRequest({ plantCode: "maap", folder: "communications", contentType: "application/pdf" }, file);

    const response = (await POST(request)) as Response;

    expect(response.status).toBe(401);
    expect(storageMock.StorageService.uploadObject).not.toHaveBeenCalled();
  });
});
