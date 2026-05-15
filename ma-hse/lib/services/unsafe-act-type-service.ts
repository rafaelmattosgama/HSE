import { DEFAULT_UNSAFE_ACT_TYPES, LEGACY_DEFAULT_UNSAFE_ACT_TYPES } from "@/lib/defaults/unsafe-act-types";
import { prisma } from "@/lib/prisma";

export async function ensureDefaultUnsafeActTypes(plantId: string) {
  await prisma.$transaction(async (tx) => {
    for (const row of DEFAULT_UNSAFE_ACT_TYPES) {
      await tx.unsafeActType.upsert({
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

    await tx.unsafeActType.updateMany({
      where: {
        plantId,
        OR: LEGACY_DEFAULT_UNSAFE_ACT_TYPES.map((row) => ({
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
