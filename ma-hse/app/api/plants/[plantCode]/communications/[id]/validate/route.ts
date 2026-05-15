import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { CommunicationService, CommunicationValidationError } from "@/lib/services/communication-service";
import { validateCommunicationInput } from "@/lib/validation/dtos";

export async function POST(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, validateCommunicationInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const communication = await prisma.communication.findFirst({ where: { id, plantId: plant.id } });
  if (!communication) {
    return fail("NOT_FOUND", "Communication not found", 404);
  }

  try {
    const updated = await CommunicationService.validate({
      communicationId: id,
      actorUserId: auth.session.user.id,
      payload: parsed.data,
    });

    return ok(updated);
  } catch (error) {
    if (error instanceof CommunicationValidationError) {
      return fail(error.code, error.message, error.status);
    }

    throw error;
  }
}
