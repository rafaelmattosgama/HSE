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
    updateMany: vi.fn(),
  },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { DELETE } from "@/app/api/plants/[plantCode]/admin/workers/route";

function routeContext(plantCode = "pl1") {
  return {
    params: Promise.resolve({ plantCode }),
  };
}

describe("workers route", () => {
  afterEach(() => {
    vi.clearAllMocks();
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
});
