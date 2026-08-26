import { FireEquipmentStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const transactionMock = vi.hoisted(() => ({
  fireEquipment: {
    update: vi.fn(),
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

const PLANT = { id: "plant-1" };

function baseUpdateInput(overrides: Partial<Parameters<typeof FireEquipmentService.update>[2]> = {}) {
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

describe("FireEquipmentService.update", () => {
  afterEach(() => vi.clearAllMocks());

  it("updates the record and audits the change", async () => {
    prismaMock.prisma.fireEquipment.findFirst
      .mockResolvedValueOnce({ id: "eq-1", fireEquipmentTypeId: "type-ext", internalCode: "EXT-000", workstationId: null })
      .mockResolvedValueOnce(null);
    prismaMock.prisma.fireEquipmentType.findFirst.mockResolvedValue({ id: "type-ext", code: "EXTINGUISHER" });
    transactionMock.fireEquipment.update.mockResolvedValue({ id: "eq-1", internalCode: "EXT-001" });

    const result = await FireEquipmentService.update(PLANT, "eq-1", baseUpdateInput(), "user-1");

    expect(result).toEqual({ id: "eq-1", internalCode: "EXT-001" });
    expect(transactionMock.fireEquipment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "eq-1" }, data: expect.objectContaining({ internalCode: "EXT-001" }) }),
    );
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "UPDATED" }), transactionMock);
  });

  it("allows saving without changing internalCode (excludes its own row from the duplicate check)", async () => {
    prismaMock.prisma.fireEquipment.findFirst
      .mockResolvedValueOnce({ id: "eq-1", fireEquipmentTypeId: "type-ext", internalCode: "EXT-001", workstationId: null })
      .mockResolvedValueOnce(null);
    prismaMock.prisma.fireEquipmentType.findFirst.mockResolvedValue({ id: "type-ext", code: "EXTINGUISHER" });
    transactionMock.fireEquipment.update.mockResolvedValue({ id: "eq-1" });

    await FireEquipmentService.update(PLANT, "eq-1", baseUpdateInput({ internalCode: "EXT-001" }), "user-1");

    expect(prismaMock.prisma.fireEquipment.findFirst).toHaveBeenNthCalledWith(2, {
      where: { plantId: "plant-1", internalCode: "EXT-001", NOT: { id: "eq-1" } },
      select: { id: true },
    });
  });

  it("rejects a code already used by a different equipment row", async () => {
    prismaMock.prisma.fireEquipment.findFirst
      .mockResolvedValueOnce({ id: "eq-1", fireEquipmentTypeId: "type-ext", internalCode: "EXT-000", workstationId: null })
      .mockResolvedValueOnce({ id: "eq-2" });
    prismaMock.prisma.fireEquipmentType.findFirst.mockResolvedValue({ id: "type-ext", code: "EXTINGUISHER" });

    await expect(FireEquipmentService.update(PLANT, "eq-1", baseUpdateInput({ internalCode: "EXT-999" }), "user-1")).rejects.toThrow(
      /already in use/,
    );
    expect(prismaMock.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects updating equipment outside the plant scope", async () => {
    prismaMock.prisma.fireEquipment.findFirst.mockResolvedValueOnce(null);

    await expect(FireEquipmentService.update(PLANT, "eq-missing", baseUpdateInput(), "user-1")).rejects.toThrow(/not found/);
    expect(prismaMock.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("drops extinguishingAgent for a non-extinguisher type", async () => {
    prismaMock.prisma.fireEquipment.findFirst
      .mockResolvedValueOnce({ id: "eq-1", fireEquipmentTypeId: "type-hose", internalCode: "CAR-000", workstationId: null })
      .mockResolvedValueOnce(null);
    prismaMock.prisma.fireEquipmentType.findFirst.mockResolvedValue({ id: "type-hose", code: "HOSE_REEL" });
    transactionMock.fireEquipment.update.mockResolvedValue({ id: "eq-1" });

    await FireEquipmentService.update(
      PLANT,
      "eq-1",
      baseUpdateInput({ fireEquipmentTypeId: "type-hose", internalCode: "CAR-000", extinguishingAgent: "ABC" }),
      "user-1",
    );

    expect(transactionMock.fireEquipment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ extinguishingAgent: null }) }),
    );
  });
});

describe("FireEquipmentService.decommission", () => {
  afterEach(() => vi.clearAllMocks());

  it("moves status to DECOMMISSIONED, flips isActive false, and audits it", async () => {
    prismaMock.prisma.fireEquipment.findFirst.mockResolvedValue({ id: "eq-1", status: FireEquipmentStatus.ACTIVE });
    transactionMock.fireEquipment.update.mockResolvedValue({ id: "eq-1", status: FireEquipmentStatus.DECOMMISSIONED });

    await FireEquipmentService.decommission(PLANT, "eq-1", { reason: "Replaced" }, "user-1");

    expect(transactionMock.fireEquipment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "eq-1" },
        data: expect.objectContaining({
          status: FireEquipmentStatus.DECOMMISSIONED,
          isActive: false,
          decommissionReason: "Replaced",
        }),
      }),
    );
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "DECOMMISSIONED" }), transactionMock);
  });

  it("rejects equipment that is already decommissioned", async () => {
    prismaMock.prisma.fireEquipment.findFirst.mockResolvedValue({ id: "eq-1", status: FireEquipmentStatus.DECOMMISSIONED });

    await expect(FireEquipmentService.decommission(PLANT, "eq-1", { reason: null }, "user-1")).rejects.toThrow(
      /already decommissioned/,
    );
    expect(transactionMock.fireEquipment.update).not.toHaveBeenCalled();
  });

  it("rejects equipment outside the plant scope", async () => {
    prismaMock.prisma.fireEquipment.findFirst.mockResolvedValue(null);

    await expect(FireEquipmentService.decommission(PLANT, "eq-missing", { reason: null }, "user-1")).rejects.toThrow(/not found/);
  });
});
