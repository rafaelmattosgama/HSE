import { ActionSourceType, RoleCode, SEWOStatus } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { logger } from "@/lib/logger";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { ActionService } from "@/lib/services/action-service";
import { SewaService, SewoValidationError } from "@/lib/services/sewo-service";
import { createSEWOInput } from "@/lib/validation/dtos";

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [
    RoleCode.N1_CORPORATE,
    RoleCode.N2_PLANT_MANAGER,
    RoleCode.N3_SAFETY,
    RoleCode.N4_SUPERVISOR,
  ]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const rows = await prisma.sEWO.findMany({
    where: { plantId: plant.id, deletedAt: null },
    include: {
      communication: true,
      causeSelections: true,
      actionLinks: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return ok(rows);
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, createSEWOInput);
  if ("error" in parsed) return parsed.error;

  try {
    const plant = await getPlantByCode(plantCode);

    const sewo = await SewaService.create({
      plantId: plant.id,
      actorUserId: auth.session.user.id,
      payload: parsed.data,
    });

    if (parsed.data.status === SEWOStatus.IN_APPROVAL) {
      for (const actionPlan of parsed.data.actionPlans) {
        await ActionService.create({
          plantId: plant.id,
          actorUserId: auth.session.user.id,
          payload: {
            sourceType: ActionSourceType.SEWO,
            sewoId: sewo.id,
            category: actionPlan.category,
            priority: actionPlan.priority,
            title: actionPlan.title,
            description: actionPlan.description,
            ownerUserId: actionPlan.ownerUserId,
            dueDate: actionPlan.dueDate,
          },
        });
      }
    }

    return ok(sewo, { status: 201 });
  } catch (error) {
    if (error instanceof SewoValidationError) {
      return fail(error.code, error.message, error.status);
    }

    logger.error(
      {
        error,
        plantCode,
        actorUserId: auth.session.user.id,
      },
      "failed_to_create_sewo",
    );
    return fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to create S-EWO", 500);
  }
}
