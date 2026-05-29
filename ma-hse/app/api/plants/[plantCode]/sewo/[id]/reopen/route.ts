import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { logger } from "@/lib/logger";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { SewaService, SewoValidationError } from "@/lib/services/sewo-service";
import { reopenEntityInput } from "@/lib/validation/dtos";

export async function POST(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, reopenEntityInput);
  if ("error" in parsed) return parsed.error;

  try {
    const plant = await getPlantByCode(plantCode);
    const sewo = await prisma.sEWO.findFirst({
      where: { id, plantId: plant.id },
      select: { id: true, status: true },
    });

    if (!sewo) {
      return fail("NOT_FOUND", "SEWO not found", 404);
    }

    const updated = await SewaService.reopen({
      sewoId: id,
      actorUserId: auth.session.user.id,
      payload: parsed.data,
    });

    return ok(updated);
  } catch (error) {
    if (error instanceof SewoValidationError) {
      return fail(error.code, error.message, error.status);
    }

    logger.error(
      {
        error,
        plantCode,
        sewoId: id,
        actorUserId: auth.session.user.id,
      },
      "failed_to_reopen_sewo",
    );
    return fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to reopen S-EWO", 500);
  }
}
