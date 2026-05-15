import { DEFAULT_NEAR_MISS_TYPES } from "@/lib/defaults/near-miss-types";
import { prisma } from "@/lib/prisma";

export async function ensureDefaultNearMissTypes(plantId: string) {
  await prisma.$transaction(
    DEFAULT_NEAR_MISS_TYPES.map((type) =>
      prisma.nearMissType.upsert({
        where: {
          plantId_code: {
            plantId,
            code: type.code,
          },
        },
        update: {
          name: type.name,
          isActive: true,
        },
        create: {
          plantId,
          code: type.code,
          name: type.name,
        },
      }),
    ),
  );
}
