import { RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({
  requirePlantAccess: vi.fn(),
}));

const plantMock = vi.hoisted(() => ({
  getPlantByCode: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  area: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  workstation: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  equipment: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  nearMissType: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  unsafeActType: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  unsafeConditionType: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  injuryType: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { DELETE, POST } from "@/app/api/plants/[plantCode]/admin/master-data/route";

function routeContext(plantCode = "pl1") {
  return {
    params: Promise.resolve({ plantCode }),
  };
}

function forbiddenResponse() {
  return new Response(
    JSON.stringify({
      ok: false,
      errorCode: "FORBIDDEN",
      message: "Insufficient role for plant scope",
    }),
    {
      status: 403,
      headers: { "content-type": "application/json" },
    },
  );
}

describe("master data route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("blocks create requests from profiles without permission", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ error: forbiddenResponse() });

    const response = await POST(
      new Request("http://localhost/api/plants/pl1/admin/master-data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "workstation",
          code: "WS1",
          name: "Packing 1",
        }),
      }),
      routeContext(),
    );

    expect(response.status).toBe(403);
  });

  it("allows N0 admin to create a workstation", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { plantRoles: [{ role: RoleCode.N0_ADMIN }] } },
      role: RoleCode.N0_ADMIN,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.workstation.findFirst.mockResolvedValue(null);
    prismaMock.workstation.create.mockResolvedValue({
      id: "ws-1",
      code: "WS1",
      name: "Packing 1",
      plantId: "plant-1",
      isActive: true,
    });

    const response = await POST(
      new Request("http://localhost/api/plants/pl1/admin/master-data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "workstation",
          code: "WS1",
          name: "Packing 1",
        }),
      }),
      routeContext(),
    );

    expect(guardsMock.requirePlantAccess).toHaveBeenCalledWith("pl1", [
      RoleCode.N0_ADMIN,
      RoleCode.N1_CORPORATE,
      RoleCode.N2_PLANT_MANAGER,
      RoleCode.N3_SAFETY,
    ]);
    expect(prismaMock.workstation.create).toHaveBeenCalledWith({
      data: {
        plantId: "plant-1",
        code: "WS1",
        name: "Packing 1",
        isActive: true,
      },
    });
    expect(response.status).toBe(201);
  });

  it("allows N0 admin to edit equipment", async () => {
    const equipmentId = "11111111-1111-4111-8111-111111111111";
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { plantRoles: [{ role: RoleCode.N0_ADMIN }] } },
      role: RoleCode.N0_ADMIN,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.equipment.findFirst
      .mockResolvedValueOnce({ id: equipmentId, plantId: "plant-1", code: "EQ1", name: "Forklift 1", isActive: true })
      .mockResolvedValueOnce(null);
    prismaMock.equipment.update.mockResolvedValue({
      id: equipmentId,
      code: "EQ1",
      name: "Forklift 1B",
      plantId: "plant-1",
      isActive: true,
    });

    const response = await POST(
      new Request("http://localhost/api/plants/pl1/admin/master-data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: equipmentId,
          type: "equipment",
          code: "EQ1",
          name: "Forklift 1B",
        }),
      }),
      routeContext(),
    );

    expect(prismaMock.equipment.update).toHaveBeenCalledWith({
      where: { id: equipmentId },
      data: {
        code: "EQ1",
        name: "Forklift 1B",
        isActive: true,
      },
    });
    expect(response.status).toBe(200);
  });

  it("allows N0 admin to deactivate an entire section", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { plantRoles: [{ role: RoleCode.N0_ADMIN }] } },
      role: RoleCode.N0_ADMIN,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.equipment.updateMany.mockResolvedValue({ count: 3 });

    const response = await DELETE(
      new Request("http://localhost/api/plants/pl1/admin/master-data", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "equipment",
          deleteAll: true,
        }),
      }),
      routeContext(),
    );

    expect(prismaMock.equipment.updateMany).toHaveBeenCalledWith({
      where: { plantId: "plant-1", isActive: true },
      data: { isActive: false },
    });
    expect(response.status).toBe(200);
  });
});
