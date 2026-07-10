import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { logger } from "@/lib/logger";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { ActionService, ActionValidationError } from "@/lib/services/action-service";
import { LINKABLE_COMMUNICATION_STATUSES } from "@/lib/communication-status";
import { createActionInput } from "@/lib/validation/dtos";
import { prisma } from "@/lib/prisma";

const PENDING_COMMUNICATION_LINK_MESSAGE = "This communication must be validated before actions or S-EWO can be linked.";

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [
    RoleCode.N1_CORPORATE,
    RoleCode.N2_PLANT_MANAGER,
    RoleCode.N3_SAFETY,
    RoleCode.N4_SUPERVISOR,
    RoleCode.N5_OPERATOR,
  ]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);

  const actions = await prisma.action.findMany({
    where: { plantId: plant.id },
    include: {
      ownerUser: true,
      coOwners: {
        include: {
          user: true,
        },
      },
      evidenceAttachments: true,
      communication: true,
      sewo: true,
      smatLinks: {
        include: {
          smatAudit: true,
        },
      },
    },
    orderBy: {
      dueDate: "asc",
    },
    take: 200,
  });

  return ok(actions);
}

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

  const parsed = await parseBody(request, createActionInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  if (parsed.data.sourceType === "COMMUNICATION" && parsed.data.communicationId) {
    const communication = await prisma.communication.findFirst({
      where: {
        id: parsed.data.communicationId,
        plantId: plant.id,
        status: {
          in: [...LINKABLE_COMMUNICATION_STATUSES],
        },
      },
      select: { id: true, status: true },
    });

    if (!communication) {
      return fail("INVALID_COMMUNICATION", PENDING_COMMUNICATION_LINK_MESSAGE, 422);
    }
  }

  if (parsed.data.sourceType === "SEWO" && parsed.data.sewoId) {
    const sewo = await prisma.sEWO.findFirst({
      where: {
        id: parsed.data.sewoId,
        plantId: plant.id,
      },
      select: { id: true },
    });

    if (!sewo) {
      return fail("INVALID_SEWO", "Select an existing S-EWO record for this plant", 422);
    }
  }

  if (parsed.data.sourceType === "SMAT" && parsed.data.smatAuditId) {
    const smat = await prisma.smatAudit.findFirst({
      where: {
        id: parsed.data.smatAuditId,
        plantId: plant.id,
      },
      select: { id: true },
    });

    if (!smat) {
      return fail("INVALID_SMAT", "Select an existing SMAT record for this plant", 422);
    }
  }

  const owner = await prisma.userPlantRole.findFirst({
    where: {
      plantId: plant.id,
      userId: parsed.data.ownerUserId,
      user: {
        isActive: true,
      },
    },
    select: {
      userId: true,
    },
  });

  if (!owner) {
    return fail("INVALID_ACTION_OWNER", "Select an active action owner for this plant", 422);
  }

  try {
    const action = await ActionService.create({
      plantId: plant.id,
      actorUserId: auth.session.user.id,
      payload: parsed.data,
    });

    return ok(action, { status: action.idempotency.reusedExistingAction ? 200 : 201 });
  } catch (error) {
    if (error instanceof ActionValidationError) {
      return fail(error.code, error.message, error.status);
    }

    logger.error(
      {
        error,
        plantCode,
        plantId: plant.id,
        actorUserId: auth.session.user.id,
        sourceType: parsed.data.sourceType,
        communicationId: parsed.data.communicationId,
        sewoId: parsed.data.sewoId,
        smatAuditId: parsed.data.smatAuditId,
        ownerUserId: parsed.data.ownerUserId,
      },
      "failed_to_create_action",
    );

    return fail("ACTION_CREATE_FAILED", "Failed to create action", 500);
  }
}
