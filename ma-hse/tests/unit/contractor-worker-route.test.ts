import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  getContractorSessionCompany: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  externalWorker: {
    updateMany: vi.fn(),
    findFirstOrThrow: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("@/lib/contractor-auth", () => authMock);
vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { DELETE, PATCH } from "@/app/api/contractors/workers/[workerId]/route";

function workerContext(workerId = "worker-1") {
  return {
    params: Promise.resolve({ workerId }),
  };
}

describe("contractor worker route authorization", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated contractor updates", async () => {
    authMock.getContractorSessionCompany.mockResolvedValue(null);

    const response = await PATCH(
      new Request("http://localhost/api/contractors/workers/worker-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      workerContext(),
    );

    expect(response.status).toBe(401);
  });

  it("filters PATCH by contractor company ownership", async () => {
    authMock.getContractorSessionCompany.mockResolvedValue({ id: "company-1" });
    prismaMock.externalWorker.updateMany.mockResolvedValue({ count: 0 });

    const response = await PATCH(
      new Request("http://localhost/api/contractors/workers/worker-2", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      workerContext("worker-2"),
    );

    expect(prismaMock.externalWorker.updateMany).toHaveBeenCalledWith({
      where: {
        id: "worker-2",
        companyId: "company-1",
      },
      data: { isActive: false },
    });
    expect(response.status).toBe(404);
  });

  it("returns the updated worker after a valid PATCH", async () => {
    authMock.getContractorSessionCompany.mockResolvedValue({ id: "company-1" });
    prismaMock.externalWorker.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.externalWorker.findFirstOrThrow.mockResolvedValue({
      id: "worker-1",
      companyId: "company-1",
      isActive: true,
    });

    const response = await PATCH(
      new Request("http://localhost/api/contractors/workers/worker-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      }),
      workerContext(),
    );

    expect(prismaMock.externalWorker.findFirstOrThrow).toHaveBeenCalledWith({
      where: {
        id: "worker-1",
        companyId: "company-1",
      },
    });
    expect(response.status).toBe(200);
  });

  it("filters DELETE by contractor company ownership", async () => {
    authMock.getContractorSessionCompany.mockResolvedValue({ id: "company-1" });
    prismaMock.externalWorker.deleteMany.mockResolvedValue({ count: 0 });

    const response = await DELETE(
      new Request("http://localhost/api/contractors/workers/worker-2", {
        method: "DELETE",
      }),
      workerContext("worker-2"),
    );

    expect(prismaMock.externalWorker.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "worker-2",
        companyId: "company-1",
      },
    });
    expect(response.status).toBe(404);
  });
});
