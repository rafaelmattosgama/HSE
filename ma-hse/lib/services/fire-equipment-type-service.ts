import { DEFAULT_FIRE_EQUIPMENT_TYPES } from "@/lib/defaults/fire-equipment-types";
import { prisma } from "@/lib/prisma";

/**
 * Lazy backfill for plants that existed before this list was introduced —
 * called on every load of the fire equipment list page, mirroring
 * ensureDefaultNearMissTypes/ensureDefaultUnsafeActTypes. New plants get the
 * same rows synchronously at creation time instead, via
 * app/api/corporate/plants/route.ts's ensurePlantDefaults.
 */
export async function ensureDefaultFireEquipmentTypes(plantId: string) {
  await prisma.$transaction(
    DEFAULT_FIRE_EQUIPMENT_TYPES.map((type) =>
      prisma.fireEquipmentType.upsert({
        where: { plantId_code: { plantId, code: type.code } },
        update: {
          name: type.name,
          category: type.category,
          codePrefix: type.codePrefix,
          displayOrder: type.displayOrder,
          isActive: true,
        },
        create: {
          plantId,
          code: type.code,
          name: type.name,
          category: type.category,
          codePrefix: type.codePrefix,
          displayOrder: type.displayOrder,
        },
      }),
    ),
  );
}
