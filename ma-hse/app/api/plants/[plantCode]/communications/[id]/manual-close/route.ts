import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { CommunicationService } from "@/lib/services/communication-service";
import { manualCloseCommunicationInput } from "@/lib/validation/dtos";

export async function POST(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;

  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, manualCloseCommunicationInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const communication = await prisma.communication.findFirst({ where: { id, plantId: plant.id } });
  if (!communication) return fail("NOT_FOUND", "Communication not found", 404);

  const updated = await CommunicationService.manualClose({
    communicationId: id,
    actorUserId: auth.session.user.id,
    payload: parsed.data,
  });

  return ok(updated);
}