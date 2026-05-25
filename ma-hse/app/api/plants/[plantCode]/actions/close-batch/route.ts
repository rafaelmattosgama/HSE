import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { logger } from "@/lib/logger";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { ActionService } from "@/lib/services/action-service";
import { bulkCloseActionInput } from "@/lib/validation/dtos";

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [
    RoleCode.N1_CORPORATE,
    RoleCode.N2_PLANT_MANAGER,
    RoleCode.N3_SAFETY,
    RoleCode.N4_SUPERVISOR,
    RoleCode.N5_OPERATOR,
  ]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, bulkCloseActionInput);
  if ("error" in parsed) return parsed.error;

  try {
    const plant = await getPlantByCode(plantCode);
    const count = await prisma.action.count({
      where: {
        plantId: plant.id,
        id: {
          in: parsed.data.actionIds,
        },
      },
    });
    if (count !== parsed.data.actionIds.length) {
      return fail("NOT_FOUND", "One or more actions were not found in this plant", 404);
    }

    const updated = await ActionService.closeMany({
      actorUserId: auth.session.user.id,
      payload: parsed.data,
    });

    return ok(updated);
  } catch (error) {
    logger.error(
      {
        error,
        plantCode,
        actorUserId: auth.session.user.id,
        actionIds: parsed.data.actionIds,
      },
      "failed_to_bulk_close_actions",
    );
    return fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to close selected actions", 500);
  }
}
