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
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  workstation: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  equipment: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  nearMissType: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  unsafeActType: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  unsafeConditionType: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  injuryType: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  line: { findMany: vi.fn() },
  shift: { findMany: vi.fn() },
  riskTheme: { findMany: vi.fn() },
  bodyPart: { findMany: vi.fn() },
  $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
}));

const translationMock = vi.hoisted(() => ({
  scheduleMasterDataTranslations: vi.fn(async () => true),
  localizeMasterDataRows: vi.fn(async (_type: string, rows: unknown[]) => rows),
  matchesMasterDataSearch: vi.fn(() => true),
}));

const auditMock = vi.hoisted(() => ({
  buildDiff: vi.fn((before: unknown, after: unknown) => ({ before, after, fieldsChanged: [] })),
  writeAuditLog: vi.fn(async () => undefined),
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));
vi.mock("@/lib/services/master-data-translation-service", () => translationMock);
vi.mock("@/lib/audit", () => auditMock);
vi.mock("@/lib/services/near-miss-type-service", () => ({ ensureDefaultNearMissTypes: vi.fn() }));
vi.mock("@/lib/services/shift-service", () => ({ ensureDefaultShifts: vi.fn() }));
vi.mock("@/lib/services/unsafe-act-type-service", () => ({ ensureDefaultUnsafeActTypes: vi.fn() }));
vi.mock("@/lib/services/unsafe-condition-type-service", () => ({ ensureDefaultUnsafeConditionTypes: vi.fn() }));

import { DELETE, GET, POST } from "@/app/api/plants/[plantCode]/admin/master-data/route";

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

  function mockEmptyMasterDataLists() {
    prismaMock.area.findMany.mockResolvedValue([]);
    prismaMock.line.findMany.mockResolvedValue([]);
    prismaMock.workstation.findMany.mockResolvedValue([]);
    prismaMock.equipment.findMany.mockResolvedValue([]);
    prismaMock.shift.findMany.mockResolvedValue([]);
    prismaMock.riskTheme.findMany.mockResolvedValue([]);
    prismaMock.unsafeActType.findMany.mockResolvedValue([]);
    prismaMock.unsafeConditionType.findMany.mockResolvedValue([]);
    prismaMock.nearMissType.findMany.mockResolvedValue([]);
    prismaMock.bodyPart.findMany.mockResolvedValue([]);
    prismaMock.injuryType.findMany.mockResolvedValue([]);
  }

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

  it("lists only equipment from the plant authorized for N3", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-n3", language: "en", plantRoles: [{ plantCode: "pl1", role: RoleCode.N3_SAFETY }] } },
      role: RoleCode.N3_SAFETY,
      plantId: "plant-1",
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    mockEmptyMasterDataLists();
    prismaMock.equipment.findMany.mockResolvedValue([
      { id: "eq-1", plantId: "plant-1", code: "EQ1", name: "Forklift 1", isActive: true },
    ]);

    const response = await GET(
      new Request("http://localhost/api/plants/pl1/admin/master-data"),
      routeContext(),
    );
    const body = await response.json();

    expect(prismaMock.equipment.findMany).toHaveBeenCalledWith({
      where: { plantId: "plant-1" },
      orderBy: [{ code: "asc" }, { name: "asc" }],
    });
    expect(body.data.equipments).toEqual([
      { id: "eq-1", plantId: "plant-1", code: "EQ1", name: "Forklift 1", isActive: true },
    ]);
  });

  it("does not expose equipment in the master-data response to N2", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-n2", language: "en", plantRoles: [{ plantCode: "pl1", role: RoleCode.N2_PLANT_MANAGER }] } },
      role: RoleCode.N2_PLANT_MANAGER,
      plantId: "plant-1",
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    mockEmptyMasterDataLists();
    prismaMock.equipment.findMany.mockResolvedValue([
      { id: "eq-1", plantId: "plant-1", code: "EQ1", name: "Forklift 1", isActive: true },
    ]);

    const response = await GET(
      new Request("http://localhost/api/plants/pl1/admin/master-data"),
      routeContext(),
    );
    const body = await response.json();

    expect(body.data.equipments).toEqual([]);
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
        sourceLanguage: null,
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
        sourceLanguage: null,
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

  it("allows N3 safety to create equipment only in the authorized plant and writes an audit log", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: {
        user: {
          id: "user-n3",
          language: "pt",
          plantRoles: [{ plantCode: "pl1", role: RoleCode.N3_SAFETY }],
        },
      },
      role: RoleCode.N3_SAFETY,
      plantId: "plant-1",
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1", defaultLanguage: "en" });
    prismaMock.equipment.findFirst.mockResolvedValue(null);
    prismaMock.equipment.create.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      plantId: "plant-1",
      code: "EQ2",
      name: "Empilhador 2",
      sourceLanguage: "pt",
      isActive: true,
    });

    const response = await POST(
      new Request("http://localhost/api/plants/pl1/admin/master-data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "equipment",
          code: "EQ2",
          name: "Empilhador 2",
        }),
      }),
      routeContext(),
    );

    expect(prismaMock.equipment.findFirst).toHaveBeenCalledWith({
      where: { plantId: "plant-1", code: "EQ2" },
    });
    expect(prismaMock.equipment.create).toHaveBeenCalledWith({
      data: {
        plantId: "plant-1",
        code: "EQ2",
        name: "Empilhador 2",
        sourceLanguage: null,
        isActive: true,
      },
    });
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "MasterData:equipment",
      entityId: "22222222-2222-4222-8222-222222222222",
      action: "CREATE",
      actorUserId: "user-n3",
      plantId: "plant-1",
    }));
    expect(response.status).toBe(201);
  });

  it("reactivates inactive equipment for N3 without creating a duplicate", async () => {
    const equipmentId = "33333333-3333-4333-8333-333333333333";
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-n3", language: "en", plantRoles: [{ plantCode: "pl1", role: RoleCode.N3_SAFETY }] } },
      role: RoleCode.N3_SAFETY,
      plantId: "plant-1",
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1", defaultLanguage: "en" });
    prismaMock.equipment.findFirst.mockResolvedValue({
      id: equipmentId,
      plantId: "plant-1",
      code: "EQ3",
      name: "Forklift 3",
      sourceLanguage: "en",
      isActive: false,
    });
    prismaMock.equipment.update.mockResolvedValue({
      id: equipmentId,
      plantId: "plant-1",
      code: "EQ3",
      name: "Forklift 3",
      sourceLanguage: "en",
      isActive: true,
    });

    const response = await POST(
      new Request("http://localhost/api/plants/pl1/admin/master-data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "equipment", code: "EQ3", name: "Forklift 3" }),
      }),
      routeContext(),
    );

    expect(prismaMock.equipment.create).not.toHaveBeenCalled();
    expect(prismaMock.equipment.update).toHaveBeenCalledWith({
      where: { id: equipmentId },
      data: { code: "EQ3", name: "Forklift 3", sourceLanguage: "en", isActive: true },
    });
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "ACTIVATE" }));
    expect(response.status).toBe(201);
  });

  it("allows N3 to edit equipment in its authorized plant", async () => {
    const equipmentId = "66666666-6666-4666-8666-666666666666";
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-n3", language: "en", plantRoles: [{ plantCode: "pl1", role: RoleCode.N3_SAFETY }] } },
      role: RoleCode.N3_SAFETY,
      plantId: "plant-1",
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.equipment.findFirst
      .mockResolvedValueOnce({ id: equipmentId, plantId: "plant-1", code: "EQ6", name: "Forklift 6", sourceLanguage: "en", isActive: true })
      .mockResolvedValueOnce(null);
    prismaMock.equipment.update.mockResolvedValue({
      id: equipmentId,
      plantId: "plant-1",
      code: "EQ6",
      name: "Forklift 6B",
      isActive: true,
    });

    const response = await POST(
      new Request("http://localhost/api/plants/pl1/admin/master-data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: equipmentId, type: "equipment", code: "EQ6", name: "Forklift 6B" }),
      }),
      routeContext(),
    );

    expect(prismaMock.equipment.update).toHaveBeenCalledWith({
      where: { id: equipmentId },
      data: { code: "EQ6", name: "Forklift 6B", sourceLanguage: null, isActive: true },
    });
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATE" }));
    expect(response.status).toBe(200);
  });

  it("rejects duplicate active equipment codes for N3", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-n3", language: "en", plantRoles: [{ plantCode: "pl1", role: RoleCode.N3_SAFETY }] } },
      role: RoleCode.N3_SAFETY,
      plantId: "plant-1",
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.equipment.findFirst.mockResolvedValue({
      id: "eq-existing",
      plantId: "plant-1",
      code: "EQ7",
      name: "Existing forklift",
      isActive: true,
    });

    const response = await POST(
      new Request("http://localhost/api/plants/pl1/admin/master-data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "equipment", code: "EQ7", name: "Duplicate forklift" }),
      }),
      routeContext(),
    );

    expect(prismaMock.equipment.create).not.toHaveBeenCalled();
    expect(response.status).toBe(409);
  });

  it("allows N3 to deactivate equipment in its authorized plant and audits the action", async () => {
    const equipmentId = "77777777-7777-4777-8777-777777777777";
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-n3", language: "en", plantRoles: [{ plantCode: "pl1", role: RoleCode.N3_SAFETY }] } },
      role: RoleCode.N3_SAFETY,
      plantId: "plant-1",
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.equipment.findFirst.mockResolvedValue({
      id: equipmentId,
      plantId: "plant-1",
      code: "EQ7",
      name: "Forklift 7",
      isActive: true,
    });
    prismaMock.equipment.updateMany.mockResolvedValue({ count: 1 });

    const response = await DELETE(
      new Request("http://localhost/api/plants/pl1/admin/master-data", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "equipment", id: equipmentId }),
      }),
      routeContext(),
    );

    expect(prismaMock.equipment.updateMany).toHaveBeenCalledWith({
      where: { id: equipmentId, plantId: "plant-1" },
      data: { isActive: false },
    });
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      entityType: "MasterData:equipment",
      entityId: equipmentId,
      action: "DEACTIVATE",
      actorUserId: "user-n3",
      plantId: "plant-1",
    }));
    expect(response.status).toBe(200);
  });

  it("prevents N3 from editing equipment that belongs to another plant", async () => {
    const equipmentId = "44444444-4444-4444-8444-444444444444";
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-n3", language: "en", plantRoles: [{ plantCode: "pl1", role: RoleCode.N3_SAFETY }] } },
      role: RoleCode.N3_SAFETY,
      plantId: "plant-1",
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.equipment.findFirst.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/plants/pl1/admin/master-data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: equipmentId,
          type: "equipment",
          code: "EQ4",
          name: "Other plant equipment",
        }),
      }),
      routeContext(),
    );

    expect(prismaMock.equipment.findFirst).toHaveBeenCalledWith({
      where: { id: equipmentId, plantId: "plant-1" },
    });
    expect(prismaMock.equipment.update).not.toHaveBeenCalled();
    expect(auditMock.writeAuditLog).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
  });

  it("does not grant equipment management to N2", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-n2", language: "en", plantRoles: [{ plantCode: "pl1", role: RoleCode.N2_PLANT_MANAGER }] } },
      role: RoleCode.N2_PLANT_MANAGER,
      plantId: "plant-1",
    });

    const response = await POST(
      new Request("http://localhost/api/plants/pl1/admin/master-data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "equipment", code: "EQ5", name: "Forbidden equipment" }),
      }),
      routeContext(),
    );

    expect(plantMock.getPlantByCode).not.toHaveBeenCalled();
    expect(prismaMock.equipment.create).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
  });

  it("prevents N3 from deactivating equipment that belongs to another plant", async () => {
    const equipmentId = "55555555-5555-4555-8555-555555555555";
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-n3", language: "en", plantRoles: [{ plantCode: "pl1", role: RoleCode.N3_SAFETY }] } },
      role: RoleCode.N3_SAFETY,
      plantId: "plant-1",
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.equipment.findFirst.mockResolvedValue(null);

    const response = await DELETE(
      new Request("http://localhost/api/plants/pl1/admin/master-data", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "equipment", id: equipmentId }),
      }),
      routeContext(),
    );

    expect(prismaMock.equipment.findFirst).toHaveBeenCalledWith({
      where: { id: equipmentId, plantId: "plant-1" },
    });
    expect(prismaMock.equipment.updateMany).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
  });
});
