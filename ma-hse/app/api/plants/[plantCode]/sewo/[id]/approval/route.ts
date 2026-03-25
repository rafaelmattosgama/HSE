import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { SewaService } from "@/lib/services/sewo-service";
import { approveSEWOInput } from "@/lib/validation/dtos";

export async function POST(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;

  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, approveSEWOInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const sewo = await prisma.sEWO.findFirst({ where: { id, plantId: plant.id } });
  if (!sewo) return fail("NOT_FOUND", "SEWO not found", 404);

  const updated = await SewaService.approve({
    sewoId: id,
    actorUserId: auth.session.user.id,
    payload: parsed.data,
  });

  return ok(updated);
}