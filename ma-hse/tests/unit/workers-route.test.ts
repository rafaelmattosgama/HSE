import { RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({
  requirePlantAccess: vi.fn(),
}));

const plantMock = vi.hoisted(() => ({
  getPlantByCode: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  employeeDirectory: {
    update: vi.fn(),
    updateMany: vi.fn(),
    findFirst: vi.fn(),
    delete: vi.fn(),
  },
  user: { count: vi.fn() },
  communication: { count: vi.fn() },
  communicationInvolvedEmployee: { count: vi.fn() },
  competenceWorker: { count: vi.fn() },
  occupationalHealthWorker: { count: vi.fn() },
  externalCompany: { count: vi.fn() },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { DELETE, POST } from "@/app/api/plants/[plantCode]/admin/workers/route";

function routeContext(plantCode = "pl1") {
  return {
    params: Promise.resolve({ plantCode }),
  };
}

describe("workers route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([true, false])("persists the chosen active status (%s) when editing an existing worker", async (isActive) => {
    guardsMock.requirePlantAccess.mockResolvedValue({ role: RoleCode.N2_PLANT_MANAGER });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    const id = "11111111-1111-4111-8111-111111111111";
    prismaMock.employeeDirectory.findFirst.mockResolvedValueOnce({ id }).mockResolvedValueOnce(null);
    prismaMock.employeeDirectory.update.mockResolvedValue({ id, isActive });

    const response = await POST(new Request("http://localhost/api/plants/pl1/admin/workers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, employeeNo: "10", name: "Guto Santos", dept: "Produção", isActive }),
    }), routeContext());

    if (!response) throw new Error("Expected a worker update response");

    expect(prismaMock.employeeDirectory.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id, plantId: "plant-1" }, select: { id: true },
    });
    expect(prismaMock.employeeDirectory.update).toHaveBeenCalledWith({
      where: { id }, data: { employeeNo: "10", name: "Guto Santos", dept: "Produção", isActive },
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data.worker.isActive).toBe(isActive);
  });

  it("allows N0 admin to deactivate all workers for a plant", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { plantRoles: [{ role: RoleCode.N0_ADMIN }] } },
      role: RoleCode.N0_ADMIN,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.employeeDirectory.updateMany.mockResolvedValue({ count: 5 });

    const response = await DELETE(
      new Request("http://localhost/api/plants/pl1/admin/workers", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deleteAll: true }),
      }),
      routeContext(),
    );

    expect(prismaMock.employeeDirectory.updateMany).toHaveBeenCalledWith({
      where: { plantId: "plant-1", isActive: true },
      data: { isActive: false },
    });
    expect(response.status).toBe(200);
  });

  it("permanently deletes only an unused worker", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { plantRoles: [{ role: RoleCode.N0_ADMIN }] } },
      role: RoleCode.N0_ADMIN,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.employeeDirectory.findFirst.mockResolvedValue({ id: "worker-1" });
    prismaMock.employeeDirectory.delete.mockResolvedValue({ id: "worker-1" });
    prismaMock.user.count.mockResolvedValue(0);
    prismaMock.communication.count.mockResolvedValue(0);
    prismaMock.communicationInvolvedEmployee.count.mockResolvedValue(0);
    prismaMock.competenceWorker.count.mockResolvedValue(0);
    prismaMock.occupationalHealthWorker.count.mockResolvedValue(0);
    prismaMock.externalCompany.count.mockResolvedValue(0);

    const response = await DELETE(
      new Request("http://localhost/api/plants/pl1/admin/workers", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", hardDelete: true }),
      }),
      routeContext(),
    );

    expect(prismaMock.employeeDirectory.delete).toHaveBeenCalledWith({ where: { id: "worker-1" } });
    expect(response.status).toBe(200);
  });
});
