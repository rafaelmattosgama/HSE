import { afterEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
    fireEquipmentType: {
      upsert: vi.fn(async () => ({})),
    },
  },
}));

vi.mock("@/lib/prisma", () => prismaMock);

import { DEFAULT_FIRE_EQUIPMENT_TYPES, FIRE_EQUIPMENT_EXTINGUISHER_CODE } from "@/lib/defaults/fire-equipment-types";
import { ensureDefaultFireEquipmentTypes } from "@/lib/services/fire-equipment-type-service";

describe("ensureDefaultFireEquipmentTypes — universal taxonomy provisioning", () => {
  afterEach(() => vi.clearAllMocks());

  it("upserts exactly the 5 canonical types by (plantId, code)", async () => {
    await ensureDefaultFireEquipmentTypes("plant-1");

    expect(prismaMock.prisma.fireEquipmentType.upsert).toHaveBeenCalledTimes(5);
    for (const type of DEFAULT_FIRE_EQUIPMENT_TYPES) {
      expect(prismaMock.prisma.fireEquipmentType.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { plantId_code: { plantId: "plant-1", code: type.code } },
          create: expect.objectContaining({ plantId: "plant-1", code: type.code, name: type.name, codePrefix: type.codePrefix }),
        }),
      );
    }
  });

  it("includes the extinguisher among the defaults under the stable code used by FireEquipmentService.create", () => {
    expect(DEFAULT_FIRE_EQUIPMENT_TYPES.some((type) => type.code === FIRE_EQUIPMENT_EXTINGUISHER_CODE)).toBe(true);
  });
});
