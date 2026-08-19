import { RoleCode, SEWOStatus } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { logger } from "@/lib/logger";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { SewaService, SewoValidationError } from "@/lib/services/sewo-service";

export async function POST(_request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE]);
  if ("error" in auth) return auth.error;
  if (!auth.session.user.plantRoles.some((entry) => entry.role === RoleCode.N1_CORPORATE)) {
    return fail("FORBIDDEN", "S-EWO report sharing is restricted to N1 Corporate", 403);
  }

  try {
    const plant = await getPlantByCode(plantCode);
    const sewo = await prisma.sEWO.findFirst({
    where: { id, plantId: plant.id, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!sewo) return fail("NOT_FOUND", "SEWO not found", 404);
    if (sewo.status !== SEWOStatus.APPROVED && sewo.status !== SEWOStatus.REJECTED) {
      return fail("INVALID_STATUS", "Only decided S-EWO reports can be shared", 400);
    }

    await SewaService.shareReport({
      sewoId: id,
      actorUserId: auth.session.user.id,
    });

    return ok({ sewoId: id, shared: true });
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
      "failed_to_share_sewo_report",
    );
    return fail("INTERNAL_ERROR", "Failed to share S-EWO report", 500);
  }
}
