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

import { FireEquipmentTagConflictError, FireEquipmentTagService } from "@/lib/services/fire-equipment-tag-service";

const PLANT = { id: "plant-1" };

function baseBindInput(overrides: Partial<Parameters<typeof FireEquipmentTagService.bindByUid>[2]> = {}) {
  return {
    tagUid: "04:AA:BB:CC",
    tagCode: "ABCD2345",
    chipType: null,
    writeSucceeded: true,
    ...overrides,
  };
}

describe("FireEquipmentTagService.bindByUid", () => {
  afterEach(() => vi.clearAllMocks());

  it("creates a FULL binding when the physical write succeeded", async () => {
    prismaMock.prisma.fireEquipment.findFirst.mockResolvedValue({ id: "eq-1", internalCode: "EXT-001" });
    prismaMock.prisma.fireEquipmentTagAssignment.findUnique.mockResolvedValue(null);
    prismaMock.prisma.fireEquipmentTagAssignment.findFirst.mockResolvedValue(null);
    transactionMock.fireEquipmentTagAssignment.findFirst.mockResolvedValue(null);
    transactionMock.fireEquipmentTagAssignment.create.mockResolvedValue({
      id: "tag-1",
      tagUid: "04:AA:BB:CC",
      tagCode: "ABCD2345",
      tagType: "NFC_AND_QR",
      chipType: null,
      bindingMode: "FULL",
      assignedAt: new Date("2026-01-01"),
      writtenAt: new Date("2026-01-01"),
    });

    const tag = await FireEquipmentTagService.bindByUid(PLANT, "eq-1", baseBindInput(), "user-1");

    expect(tag.bindingMode).toBe("FULL");
    expect(transactionMock.fireEquipmentTagAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tagUid: "04:AA:BB:CC", tagCode: "ABCD2345", bindingMode: "FULL" }),
      }),
    );
    expect(transactionMock.fireEquipmentTagAssignment.create.mock.calls[0][0].data.writtenAt).toBeInstanceOf(Date);
  });

  it("§5.1 rule 4: falls back to UID_ONLY, with no writtenAt, when the physical write failed", async () => {
    prismaMock.prisma.fireEquipment.findFirst.mockResolvedValue({ id: "eq-1", internalCode: "EXT-001" });
    prismaMock.prisma.fireEquipmentTagAssignment.findUnique.mockResolvedValue(null);
    prismaMock.prisma.fireEquipmentTagAssignment.findFirst.mockResolvedValue(null);
    transactionMock.fireEquipmentTagAssignment.findFirst.mockResolvedValue(null);
    transactionMock.fireEquipmentTagAssignment.create.mockResolvedValue({
      id: "tag-1",
      tagUid: "04:AA:BB:CC",
      tagCode: "ABCD2345",
      tagType: "NFC_AND_QR",
      chipType: null,
      bindingMode: "UID_ONLY",
      assignedAt: new Date("2026-01-01"),
      writtenAt: null,
    });

    const tag = await FireEquipmentTagService.bindByUid(PLANT, "eq-1", baseBindInput({ writeSucceeded: false }), "user-1");

    expect(tag.bindingMode).toBe("UID_ONLY");
    expect(transactionMock.fireEquipmentTagAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bindingMode: "UID_ONLY", writtenAt: null }) }),
    );
  });

  it("§5.1 rule 3: refuses a uid already actively bound elsewhere, without a transfer confirmation", async () => {
    prismaMock.prisma.fireEquipment.findFirst.mockResolvedValue({ id: "eq-2", internalCode: "EXT-002" });
    prismaMock.prisma.fireEquipmentTagAssignment.findUnique.mockResolvedValue(null);
    prismaMock.prisma.fireEquipmentTagAssignment.findFirst.mockResolvedValue({
      id: "tag-old",
      fireEquipmentId: "eq-1",
      fireEquipment: { internalCode: "EXT-001" },
    });

    const error = await FireEquipmentTagService.bindByUid(PLANT, "eq-2", baseBindInput(), "user-1").catch((caught) => caught);

    expect(error).toBeInstanceOf(FireEquipmentTagConflictError);
    expect((error as FireEquipmentTagConflictError).equipmentId).toBe("eq-1");
    expect((error as FireEquipmentTagConflictError).equipmentInternalCode).toBe("EXT-001");
    expect(prismaMock.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("transfers when transferFromEquipmentId matches the conflicting equipment, clearing tagUid on the losing row", async () => {
    prismaMock.prisma.fireEquipment.findFirst.mockResolvedValue({ id: "eq-2", internalCode: "EXT-002" });
    prismaMock.prisma.fireEquipmentTagAssignment.findUnique.mockResolvedValue(null);
    prismaMock.prisma.fireEquipmentTagAssignment.findFirst.mockResolvedValue({
      id: "tag-old",
      fireEquipmentId: "eq-1",
      fireEquipment: { internalCode: "EXT-001" },
    });
    transactionMock.fireEquipmentTagAssignment.findFirst.mockResolvedValue(null);
    transactionMock.fireEquipmentTagAssignment.create.mockResolvedValue({
      id: "tag-new",
      tagUid: "04:AA:BB:CC",
      tagCode: "ABCD2345",
      tagType: "NFC_AND_QR",
      chipType: null,
      bindingMode: "FULL",
      assignedAt: new Date("2026-01-01"),
      writtenAt: new Date("2026-01-01"),
    });

    await FireEquipmentTagService.bindByUid(PLANT, "eq-2", baseBindInput({ transferFromEquipmentId: "eq-1" }), "user-1");

    expect(transactionMock.fireEquipmentTagAssignment.update).toHaveBeenCalledWith({
      where: { id: "tag-old" },
      data: expect.objectContaining({ isActive: false, tagUid: null }),
    });
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "TRANSFERRED" }), transactionMock);
  });

  it("closes the target equipment's own current active assignment before creating the new one (§5.1 rule 6)", async () => {
    prismaMock.prisma.fireEquipment.findFirst.mockResolvedValue({ id: "eq-1", internalCode: "EXT-001" });
    prismaMock.prisma.fireEquipmentTagAssignment.findUnique.mockResolvedValue(null);
    prismaMock.prisma.fireEquipmentTagAssignment.findFirst.mockResolvedValue(null);
    transactionMock.fireEquipmentTagAssignment.findFirst.mockResolvedValue({ id: "tag-current" });
    transactionMock.fireEquipmentTagAssignment.create.mockResolvedValue({
      id: "tag-new",
      tagUid: "04:AA:BB:CC",
      tagCode: "ABCD2345",
      tagType: "NFC_AND_QR",
      chipType: null,
      bindingMode: "FULL",
      assignedAt: new Date("2026-01-01"),
      writtenAt: new Date("2026-01-01"),
    });

    await FireEquipmentTagService.bindByUid(PLANT, "eq-1", baseBindInput(), "user-1");

    expect(transactionMock.fireEquipmentTagAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "tag-current" }, data: expect.objectContaining({ isActive: false }) }),
    );
  });

  it("rejects when the client-generated tagCode collides with an existing one", async () => {
    prismaMock.prisma.fireEquipment.findFirst.mockResolvedValue({ id: "eq-1", internalCode: "EXT-001" });
    prismaMock.prisma.fireEquipmentTagAssignment.findUnique.mockResolvedValue({ id: "existing" });

    await expect(FireEquipmentTagService.bindByUid(PLANT, "eq-1", baseBindInput(), "user-1")).rejects.toThrow(/collided/);
    expect(prismaMock.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects equipment outside the plant scope", async () => {
    prismaMock.prisma.fireEquipment.findFirst.mockResolvedValue(null);

    await expect(FireEquipmentTagService.bindByUid(PLANT, "eq-missing", baseBindInput(), "user-1")).rejects.toThrow(/not found/);
  });
});

describe("FireEquipmentTagService.resolveByUid", () => {
  afterEach(() => vi.clearAllMocks());

  it("resolves the equipment for an active uid, scoped to the plant", async () => {
    prismaMock.prisma.fireEquipmentTagAssignment.findFirst.mockResolvedValue({
      fireEquipment: { id: "eq-1", internalCode: "EXT-001", fireEquipmentType: { name: "Extintor" } },
    });

    const result = await FireEquipmentTagService.resolveByUid("plant-1", "04:AA:BB:CC");

    expect(result).toEqual({ fireEquipmentId: "eq-1", internalCode: "EXT-001", fireEquipmentTypeName: "Extintor" });
    expect(prismaMock.prisma.fireEquipmentTagAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tagUid: "04:AA:BB:CC", isActive: true, plantId: "plant-1" } }),
    );
  });

  it("§5.1 rule 3: an unknown uid resolves to null, not an error", async () => {
    prismaMock.prisma.fireEquipmentTagAssignment.findFirst.mockResolvedValue(null);

    const result = await FireEquipmentTagService.resolveByUid("plant-1", "unknown-uid");

    expect(result).toBeNull();
  });
});

describe("FireEquipmentTagService.assignOrReplaceTag — no-scan path still marks CODE_ONLY", () => {
  afterEach(() => vi.clearAllMocks());

  it("sets bindingMode CODE_ONLY and leaves tagUid/writtenAt unset", async () => {
    prismaMock.prisma.fireEquipment.findFirst.mockResolvedValue({ id: "eq-1" });
    transactionMock.fireEquipmentTagAssignment.findFirst.mockResolvedValue(null);
    transactionMock.fireEquipmentTagAssignment.findUnique.mockResolvedValue(null);
    transactionMock.fireEquipmentTagAssignment.create.mockResolvedValue({
      id: "tag-1",
      tagCode: "ABCD2345",
      tagType: "QR_ONLY",
      assignedAt: new Date("2026-01-01"),
    });

    await FireEquipmentTagService.assignOrReplaceTag(PLANT, "eq-1", { tagType: "QR_ONLY" as never }, "user-1");

    expect(transactionMock.fireEquipmentTagAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bindingMode: "CODE_ONLY" }) }),
    );
  });
});
