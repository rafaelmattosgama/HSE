import { DEFAULT_UNSAFE_CONDITION_TYPES, LEGACY_DEFAULT_UNSAFE_CONDITION_TYPES } from "@/lib/defaults/unsafe-condition-types";
import { prisma } from "@/lib/prisma";

export async function ensureDefaultUnsafeConditionTypes(plantId: string) {
  await prisma.$transaction(async (tx) => {
    for (const row of DEFAULT_UNSAFE_CONDITION_TYPES) {
      await tx.unsafeConditionType.upsert({
        where: {
          plantId_code: {
            plantId,
            code: row.code,
          },
        },
        update: {
          category: row.category,
          name: row.name,
          isActive: true,
        },
        create: {
          plantId,
          code: row.code,
          category: row.category,
          name: row.name,
        },
      });
    }

    await tx.unsafeConditionType.updateMany({
      where: {
        plantId,
        OR: LEGACY_DEFAULT_UNSAFE_CONDITION_TYPES.map((row) => ({
          code: row.code,
          name: row.name,
        })),
      },
      data: {
        isActive: false,
      },
    });
  });
}

