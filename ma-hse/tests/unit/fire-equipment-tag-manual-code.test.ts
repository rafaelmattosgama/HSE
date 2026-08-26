import { FireEquipmentTagType } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const transactionMock = vi.hoisted(() => ({
  fireEquipmentTagAssignment: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
}));

const prismaMock = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: typeof transactionMock) => Promise<unknown>) => callback(transactionMock)),
    fireEquipment: {
      findFirst: vi.fn(),
    },
    fireEquipmentTagAssignment: {
      findUnique: vi.fn(),
    },
  },
}));

const auditMock = vi.hoisted(() => ({
  buildDiff: vi.fn((before: unknown, after: unknown) => ({ before, after, fieldsChanged: [] })),
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/audit", () => auditMock);

import { FireEquipmentTagService } from "@/lib/services/fire-equipment-tag-service";

const PLANT = { id: "plant-1" };

describe("FireEquipmentTagService.assignOrReplaceTag — reusing an existing physical tag code", () => {
  afterEach(() => vi.clearAllMocks());

  it("uses the provided tagCode instead of generating a random one", async () => {
    prismaMock.prisma.fireEquipment.findFirst.mockResolvedValue({ id: "eq-1" });
    prismaMock.prisma.fireEquipmentTagAssignment.findUnique.mockResolvedValue(null);
    transactionMock.fireEquipmentTagAssignment.findFirst.mockResolvedValue(null);
    transactionMock.fireEquipmentTagAssignment.create.mockResolvedValue({
      id: "tag-1",
      tagCode: "MYTAG01",
      tagType: FireEquipmentTagType.NFC_AND_QR,
      assignedAt: new Date("2026-01-01"),
    });

    const tag = await FireEquipmentTagService.assignOrReplaceTag(
      PLANT,
      "eq-1",
      { tagType: FireEquipmentTagType.NFC_AND_QR, tagCode: "  MYTAG01  " },
      "user-1",
    );

    expect(tag.tagCode).toBe("MYTAG01");
    expect(transactionMock.fireEquipmentTagAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tagCode: "MYTAG01" }) }),
    );
  });

  it("rejects a tagCode already assigned to another piece of equipment, before opening the transaction", async () => {
    prismaMock.prisma.fireEquipment.findFirst.mockResolvedValue({ id: "eq-1" });
    prismaMock.prisma.fireEquipmentTagAssignment.findUnique.mockResolvedValue({ id: "existing-assignment" });

    await expect(
      FireEquipmentTagService.assignOrReplaceTag(PLANT, "eq-1", { tagType: FireEquipmentTagType.NFC_AND_QR, tagCode: "TAKEN01" }, "user-1"),
    ).rejects.toThrow(/already assigned/);
    expect(prismaMock.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("falls back to auto-generation when no tagCode is provided", async () => {
    prismaMock.prisma.fireEquipment.findFirst.mockResolvedValue({ id: "eq-1" });
    transactionMock.fireEquipmentTagAssignment.findFirst.mockResolvedValue(null);
    transactionMock.fireEquipmentTagAssignment.findUnique.mockResolvedValue(null);
    transactionMock.fireEquipmentTagAssignment.create.mockResolvedValue({
      id: "tag-1",
      tagCode: "AUTOGEN1",
      tagType: FireEquipmentTagType.NFC_AND_QR,
      assignedAt: new Date("2026-01-01"),
    });

    const tag = await FireEquipmentTagService.assignOrReplaceTag(
      PLANT,
      "eq-1",
      { tagType: FireEquipmentTagType.NFC_AND_QR, tagCode: null },
      "user-1",
    );

    expect(prismaMock.prisma.fireEquipmentTagAssignment.findUnique).not.toHaveBeenCalled();
    expect(tag.tagCode).toBe("AUTOGEN1");
  });
});
