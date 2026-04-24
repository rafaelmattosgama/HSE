import { CommunicationStatus, RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { CommunicationService } from "@/lib/services/communication-service";
import { updateCommunicationInput } from "@/lib/validation/dtos";

export async function GET(
  _request: Request,
  context: { params: Promise<{ plantCode: string; id: string }> },
) {
  const { plantCode, id } = await context.params;

  const auth = await requirePlantAccess(plantCode, [
    RoleCode.N1_CORPORATE,
    RoleCode.N2_PLANT_MANAGER,
    RoleCode.N3_SAFETY,
    RoleCode.N4_SUPERVISOR,
    RoleCode.N5_OPERATOR,
    RoleCode.MEDICO,
  ]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);

  const communication = await prisma.communication.findFirst({
    where: { id, plantId: plant.id },
    include: {
      attachments: true,
      actions: {
        include: {
          ownerUser: true,
          coOwners: {
            include: { user: true },
          },
        },
      },
      sewoRecords: true,
    },
  });

  if (!communication) {
    return fail("NOT_FOUND", "Communication not found", 404);
  }

  return ok(communication);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ plantCode: string; id: string }> },
) {
  const { plantCode, id } = await context.params;

  const auth = await requirePlantAccess(plantCode, [
    RoleCode.N1_CORPORATE,
    RoleCode.N3_SAFETY,
  ]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, updateCommunicationInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const communication = await prisma.communication.findFirst({
    where: { id, plantId: plant.id },
    select: { id: true, status: true },
  });
  const actorRole = "role" in auth ? auth.role : undefined;

  if (!communication) {
    return fail("NOT_FOUND", "Communication not found", 404);
  }

  const editableStatuses: CommunicationStatus[] =
    actorRole === RoleCode.N3_SAFETY
      ? [
          CommunicationStatus.SUBMITTED,
          CommunicationStatus.PENDING_VALIDATION,
          CommunicationStatus.VALID_OPEN,
          CommunicationStatus.ONGOING,
          CommunicationStatus.CLOSED,
        ]
      : [CommunicationStatus.VALID_OPEN, CommunicationStatus.ONGOING, CommunicationStatus.CLOSED];

  if (!editableStatuses.includes(communication.status)) {
    return fail("INVALID_STATE", "Only valid communications can be edited here", 409);
  }

  const updated = await CommunicationService.update({
    communicationId: id,
    actorUserId: auth.session.user.id,
    payload: parsed.data,
  });

  return ok(updated);
}
