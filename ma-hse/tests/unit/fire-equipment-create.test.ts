import { afterEach, describe, expect, it, vi } from "vitest";

const transactionMock = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  fireEquipment: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
}));

const prismaMock = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: typeof transactionMock) => Promise<unknown>) => callback(transactionMock)),
    fireEquipmentType: {
      findFirst: vi.fn(),
    },
    fireEquipment: {
      findFirst: vi.fn(),
    },
    workstation: {
      findFirst: vi.fn(),
    },
  },
}));

const auditMock = vi.hoisted(() => ({
  buildDiff: vi.fn((before: unknown, after: unknown) => ({ before, after, fieldsChanged: [] })),
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/audit", () => auditMock);

import { FireEquipmentService } from "@/lib/services/fire-equipment-service";

const PLANT = { id: "plant-1", code: "maap" };

function baseInput(overrides: Partial<Parameters<typeof FireEquipmentService.create>[1]> = {}) {
  return {
    fireEquipmentTypeId: "type-ext",
    internalCode: "EXT-001",
    workstationId: null,
    locationDescription: null,
    extinguishingAgent: null,
    locationPhotoFileKey: null,
    installedAt: null,
    manufactureDate: null,
    ...overrides,
  };
}

describe("FireEquipmentService.create — location, code and extinguishing agent fields", () => {
  afterEach(() => vi.clearAllMocks());

  it("keeps extinguishingAgent when the selected type is the extinguisher", async () => {
    prismaMock.prisma.fireEquipmentType.findFirst.mockResolvedValue({ id: "type-ext", code: "EXTINGUISHER" });
    prismaMock.prisma.fireEquipment.findFirst.mockResolvedValue(null);
    transactionMock.fireEquipment.findFirst.mockResolvedValue(null);
    transactionMock.fireEquipment.create.mockResolvedValue({ id: "eq-1" });

    await FireEquipmentService.create(PLANT, baseInput({ extinguishingAgent: "ABC" }), "user-1");

    expect(transactionMock.fireEquipment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ extinguishingAgent: "ABC" }) }),
    );
  });

  it("drops extinguishingAgent to null for a non-extinguisher type, even if the payload sends one", async () => {
    prismaMock.prisma.fireEquipmentType.findFirst.mockResolvedValue({ id: "type-hose", code: "HOSE_REEL" });
    prismaMock.prisma.fireEquipment.findFirst.mockResolvedValue(null);
    transactionMock.fireEquipment.findFirst.mockResolvedValue(null);
    transactionMock.fireEquipment.create.mockResolvedValue({ id: "eq-1" });

    await FireEquipmentService.create(
      PLANT,
      baseInput({ fireEquipmentTypeId: "type-hose", extinguishingAgent: "WATER" }),
      "user-1",
    );

    expect(transactionMock.fireEquipment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ extinguishingAgent: null }) }),
    );
  });

  it("persists the user-typed internalCode and locationPhotoFileKey, and the workstationId (never an areaId)", async () => {
    prismaMock.prisma.fireEquipmentType.findFirst.mockResolvedValue({ id: "type-ext", code: "EXTINGUISHER" });
    prismaMock.prisma.fireEquipment.findFirst.mockResolvedValue(null);
    prismaMock.prisma.workstation.findFirst.mockResolvedValue({ id: "ws-1" });
    transactionMock.fireEquipment.findFirst.mockResolvedValue(null);
    transactionMock.fireEquipment.create.mockResolvedValue({ id: "eq-1" });

    await FireEquipmentService.create(
      PLANT,
      baseInput({
        internalCode: "  EXT-Sala-01  ",
        workstationId: "ws-1",
        locationDescription: "Corredor piso 1",
        locationPhotoFileKey: "fire-equipment/maap/photo.jpg",
      }),
      "user-1",
    );

    const createCall = transactionMock.fireEquipment.create.mock.calls[0][0];
    expect(createCall.data).toEqual(
      expect.objectContaining({
        internalCode: "EXT-Sala-01",
        workstationId: "ws-1",
        locationPhotoFileKey: "fire-equipment/maap/photo.jpg",
      }),
    );
    expect(createCall.data.areaId).toBeUndefined();
  });

  it("keeps sequenceNumber generation (advisory lock + max+1) even though it no longer feeds the code", async () => {
    prismaMock.prisma.fireEquipmentType.findFirst.mockResolvedValue({ id: "type-ext", code: "EXTINGUISHER" });
    prismaMock.prisma.fireEquipment.findFirst.mockResolvedValue(null);
    transactionMock.fireEquipment.findFirst.mockResolvedValue({ sequenceNumber: 4 });
    transactionMock.fireEquipment.create.mockResolvedValue({ id: "eq-1" });

    await FireEquipmentService.create(PLANT, baseInput(), "user-1");

    expect(transactionMock.$executeRaw).toHaveBeenCalled();
    expect(transactionMock.fireEquipment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sequenceNumber: 5, internalCode: "EXT-001" }) }),
    );
  });

  it("rejects a duplicate equipment code within the same plant before opening the transaction", async () => {
    prismaMock.prisma.fireEquipmentType.findFirst.mockResolvedValue({ id: "type-ext", code: "EXTINGUISHER" });
    prismaMock.prisma.fireEquipment.findFirst.mockResolvedValue({ id: "existing-eq" });

    await expect(FireEquipmentService.create(PLANT, baseInput({ internalCode: "EXT-001" }), "user-1")).rejects.toThrow(
      /already in use/,
    );
    expect(prismaMock.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a workstationId outside the plant scope before opening the transaction", async () => {
    prismaMock.prisma.fireEquipmentType.findFirst.mockResolvedValue({ id: "type-ext", code: "EXTINGUISHER" });
    prismaMock.prisma.fireEquipment.findFirst.mockResolvedValue(null);
    prismaMock.prisma.workstation.findFirst.mockResolvedValue(null);

    await expect(
      FireEquipmentService.create(PLANT, baseInput({ workstationId: "ws-other-plant" }), "user-1"),
    ).rejects.toThrow(/Workstation not found/);
    expect(prismaMock.prisma.$transaction).not.toHaveBeenCalled();
  });
});
