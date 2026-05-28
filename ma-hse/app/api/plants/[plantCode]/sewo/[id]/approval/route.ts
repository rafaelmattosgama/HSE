import { RoleCode, SEWOStatus } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { logger } from "@/lib/logger";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { SewaService } from "@/lib/services/sewo-service";
import { approveSEWOInput } from "@/lib/validation/dtos";

export async function POST(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;

  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE]);
  if ("error" in auth) return auth.error;
  const hasN1ValidationRole = auth.session.user.plantRoles.some((entry) => entry.role === RoleCode.N1_CORPORATE);
  if (!hasN1ValidationRole) {
    return fail("FORBIDDEN", "S-EWO approval is restricted to N1 Corporate", 403);
  }

  const parsed = await parseBody(request, approveSEWOInput);
  if ("error" in parsed) return parsed.error;

  try {
    const plant = await getPlantByCode(plantCode);
    const sewo = await prisma.sEWO.findFirst({ where: { id, plantId: plant.id } });
    if (!sewo) return fail("NOT_FOUND", "SEWO not found", 404);
    if (sewo.status !== SEWOStatus.IN_APPROVAL) {
      return fail("INVALID_STATUS", "Only submitted S-EWO records can be approved or rejected", 400);
    }

    const updated = await SewaService.approve({
      sewoId: id,
      actorUserId: auth.session.user.id,
      payload: parsed.data,
    });

    return ok(updated);
  } catch (error) {
    logger.error(
      {
        error,
        plantCode,
        sewoId: id,
        actorUserId: auth.session.user.id,
      },
      "failed_to_approve_sewo",
    );
    return fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to approve S-EWO", 500);
  }
}
