import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { logger } from "@/lib/logger";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { ActionService } from "@/lib/services/action-service";
import { closeActionInput } from "@/lib/validation/dtos";

export async function POST(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;

  const auth = await requirePlantAccess(plantCode, [
    RoleCode.N1_CORPORATE,
    RoleCode.N2_PLANT_MANAGER,
    RoleCode.N3_SAFETY,
    RoleCode.N4_SUPERVISOR,
    RoleCode.N5_OPERATOR,
  ]);

  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, closeActionInput);
  if ("error" in parsed) return parsed.error;

  try {
    const plant = await getPlantByCode(plantCode);
    const action = await prisma.action.findFirst({ where: { id, plantId: plant.id } });
    if (!action) return fail("NOT_FOUND", "Action not found", 404);

    const updated = await ActionService.close({
      actionId: id,
      actorUserId: auth.session.user.id,
      payload: parsed.data,
    });

    return ok(updated);
  } catch (error) {
    logger.error(
      {
        error,
        plantCode,
        actionId: id,
        actorUserId: auth.session.user.id,
      },
      "failed_to_close_action",
    );
    return fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to close action", 500);
  }
}
