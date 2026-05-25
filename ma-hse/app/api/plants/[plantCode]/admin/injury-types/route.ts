import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { DEFAULT_INJURY_TYPES } from "@/lib/defaults/injury-types";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";

export async function POST(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);

  await prisma.$transaction(
    DEFAULT_INJURY_TYPES.map((name, index) =>
      prisma.injuryType.upsert({
        where: {
          plantId_code: {
            plantId: plant.id,
            code: `IT${String(index + 1).padStart(2, "0")}`,
          },
        },
        update: {
          name,
          isActive: true,
        },
        create: {
          plantId: plant.id,
          code: `IT${String(index + 1).padStart(2, "0")}`,
          name,
          isActive: true,
        },
      }),
    ),
  );

  const injuryTypes = await prisma.injuryType.findMany({
    where: { plantId: plant.id, isActive: true },
    orderBy: { name: "asc" },
  });

  return ok({
    injuryTypes,
    summary: {
      injuryTypes: injuryTypes.length,
    },
  });
}
