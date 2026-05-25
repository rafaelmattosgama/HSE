import { ActionSourceType, RoleCode, SEWOStatus } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { logger } from "@/lib/logger";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { ActionService } from "@/lib/services/action-service";
import { SewaService } from "@/lib/services/sewo-service";
import { updateSEWOInput } from "@/lib/validation/dtos";

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);

  const sewo = await prisma.sEWO.findFirst({
    where: {
      id,
      plantId: plant.id,
    },
    include: {
      communication: true,
      causeSelections: {
        include: {
          causeItem: {
            include: {
              category: true,
            },
          },
        },
      },
      attachments: true,
      actionLinks: {
        include: {
          action: true,
        },
      },
    },
  });

  if (!sewo) return fail("NOT_FOUND", "SEWO not found", 404);

  return ok(sewo);
}

export async function PUT(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, updateSEWOInput);
  if ("error" in parsed) return parsed.error;

  try {
    const plant = await getPlantByCode(plantCode);
    const sewo = await prisma.sEWO.findFirst({
      where: {
        id,
        plantId: plant.id,
      },
      select: { id: true, status: true },
    });

    if (!sewo) return fail("NOT_FOUND", "SEWO not found", 404);

    const updated = await SewaService.update({
      sewoId: id,
      actorUserId: auth.session.user.id,
      payload: parsed.data,
    });

    if (sewo.status !== SEWOStatus.IN_APPROVAL && parsed.data.status === SEWOStatus.IN_APPROVAL) {
      for (const actionPlan of parsed.data.actionPlans) {
        await ActionService.create({
          plantId: plant.id,
          actorUserId: auth.session.user.id,
          payload: {
            sourceType: ActionSourceType.SEWO,
            sewoId: updated.id,
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

    return ok(updated);
  } catch (error) {
    logger.error(
      {
        error,
        plantCode,
        sewoId: id,
        actorUserId: auth.session.user.id,
      },
      "failed_to_update_sewo",
    );
    return fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to update S-EWO", 500);
  }
}
