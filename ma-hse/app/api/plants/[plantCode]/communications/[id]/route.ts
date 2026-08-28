import { CommunicationStatus, RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import {
  canManageCommunicationClassification,
  shouldDeferPublicReportNearMissType,
  shouldDeferPublicReportProfessionalRisk,
  shouldDeferPublicReportUnsafeActType,
  shouldDeferPublicReportUnsafeConditionType,
} from "@/lib/communication-classification";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { CommunicationService, CommunicationValidationError } from "@/lib/services/communication-service";
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
    RoleCode.N6_HR,
  ]);
  if ("error" in auth) return auth.error;
  const actorRole = "role" in auth ? auth.role : undefined;

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

  if (!canManageCommunicationClassification(actorRole)) {
    return ok({
      ...communication,
      riskThemeId: shouldDeferPublicReportProfessionalRisk(communication.type) ? null : communication.riskThemeId,
      unsafeActTypeId: shouldDeferPublicReportUnsafeActType(communication.type) ? null : communication.unsafeActTypeId,
      unsafeConditionTypeId: shouldDeferPublicReportUnsafeConditionType(communication.type) ? null : communication.unsafeConditionTypeId,
      nearMissTypeId: shouldDeferPublicReportNearMissType(communication.type) ? null : communication.nearMissTypeId,
    });
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
    RoleCode.N2_PLANT_MANAGER,
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
    canManageCommunicationClassification(actorRole)
      ? [
          CommunicationStatus.SUBMITTED,
          CommunicationStatus.PENDING_VALIDATION,
          CommunicationStatus.VALID_OPEN,
          CommunicationStatus.ONGOING,
          CommunicationStatus.CLOSED,
        ]
      : [];

  if (!editableStatuses.includes(communication.status)) {
    return fail("INVALID_STATE", "Only valid communications can be edited here", 409);
  }

  const updated = await (async () => {
    try {
      return await CommunicationService.update({
        communicationId: id,
        actorUserId: auth.session.user.id,
        actorRole,
        payload: parsed.data,
      });
    } catch (error) {
      if (error instanceof CommunicationValidationError) {
        return fail(error.code, error.message, error.status);
      }
      throw error;
    }
  })();
  if (updated instanceof Response) return updated;

  return ok(updated);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ plantCode: string; id: string }> },
) {
  const { plantCode, id } = await context.params;

  const auth = await requirePlantAccess(plantCode, [
    RoleCode.N0_ADMIN,
    RoleCode.N1_CORPORATE,
    RoleCode.N3_SAFETY,
  ]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const communication = await prisma.communication.findFirst({
    where: { id, plantId: plant.id },
    select: { id: true },
  });

  if (!communication) {
    return fail("NOT_FOUND", "Communication not found", 404);
  }

  const deleted = await CommunicationService.deleteCommunication({
    communicationId: id,
    actorUserId: auth.session.user.id,
  });

  return ok(deleted);
}
