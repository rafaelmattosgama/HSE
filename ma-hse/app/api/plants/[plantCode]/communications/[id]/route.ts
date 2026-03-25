import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";

export async function GET(
  _request: Request,
  context: { params: Promise<{ plantCode: string; id: string }> },
) {
  const { plantCode, id } = await context.params;

  const auth = await requirePlantAccess(plantCode, [
    RoleCode.N1_CORPORATE,
    RoleCode.N2_PLANT_MANAGER,
    RoleCode.N3_SAFETY,
    RoleCode.N4_SUPERVISOR,
    RoleCode.N5_OPERATOR,
    RoleCode.MEDICO,
  ]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);

  const communication = await prisma.communication.findFirst({
    where: { id, plantId: plant.id },
    include: {
      attachments: true,
      actions: {
        include: {
          ownerUser: true,
          coOwners: {
            include: { user: true },
          },
        },
      },
      sewoRecords: true,
    },
  });

  if (!communication) {
    return fail("NOT_FOUND", "Communication not found", 404);
  }

  return ok(communication);
}