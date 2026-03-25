import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);

  const sewo = await prisma.sEWO.findFirst({
    where: {
      id,
      plantId: plant.id,
    },
    include: {
      communication: true,
      causeSelections: {
        include: {
          causeItem: {
            include: {
              category: true,
            },
          },
        },
      },
      attachments: true,
      actionLinks: {
        include: {
          action: true,
        },
      },
    },
  });

  if (!sewo) return fail("NOT_FOUND", "SEWO not found", 404);

  return ok(sewo);
}