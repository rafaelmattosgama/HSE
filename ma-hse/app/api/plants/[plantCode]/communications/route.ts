import { ActionCategory, ActionSourceType, CommunicationStatus, RoleCode } from "@prisma/client";
import { NextRequest } from "next/server";
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
import { createCommunicationInput } from "@/lib/validation/dtos";
import { ActionService } from "@/lib/services/action-service";
import { CommunicationService, CommunicationValidationError } from "@/lib/services/communication-service";
import { isCommunicationLinkableStatus } from "@/lib/communication-status";
import { initialStatusForCommunicationCreation } from "@/lib/services/workflow";

export async function GET(request: NextRequest, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;

  const auth = await requirePlantAccess(plantCode, [
    RoleCode.N1_CORPORATE,
    RoleCode.N2_PLANT_MANAGER,
    RoleCode.N3_SAFETY,
    RoleCode.N4_SUPERVISOR,
    RoleCode.N5_OPERATOR,
    RoleCode.MEDICO,
  ]);
  if ("error" in auth) return auth.error;
  const actorRole = "role" in auth ? auth.role : undefined;

  const plant = await getPlantByCode(plantCode);
  const status = request.nextUrl.searchParams.get("status") ?? undefined;
  const defaultStatuses = [
    CommunicationStatus.SUBMITTED,
    CommunicationStatus.PENDING_VALIDATION,
    CommunicationStatus.VALID_OPEN,
    CommunicationStatus.ONGOING,
    CommunicationStatus.CLOSED,
  ];

  const communications = await prisma.communication.findMany({
    where: {
      plantId: plant.id,
      status: status ? (status as never) : { in: defaultStatuses },
    },
    include: {
      riskTheme: true,
      unsafeConditionType: true,
      nearMissType: true,
      actions: true,
      reporterUser: true,
    },
    orderBy: {
      eventDatetime: "desc",
    },
    take: 200,
  });

  if (!canManageCommunicationClassification(actorRole)) {
    return ok(
      communications.map((communication) => ({
        ...communication,
        riskThemeId: shouldDeferPublicReportProfessionalRisk(communication.type) ? null : communication.riskThemeId,
        riskTheme: shouldDeferPublicReportProfessionalRisk(communication.type) ? null : communication.riskTheme,
        unsafeActTypeId: shouldDeferPublicReportUnsafeActType(communication.type) ? null : communication.unsafeActTypeId,
        unsafeConditionTypeId: shouldDeferPublicReportUnsafeConditionType(communication.type) ? null : communication.unsafeConditionTypeId,
        unsafeConditionType: shouldDeferPublicReportUnsafeConditionType(communication.type) ? null : communication.unsafeConditionType,
        nearMissTypeId: shouldDeferPublicReportNearMissType(communication.type) ? null : communication.nearMissTypeId,
        nearMissType: shouldDeferPublicReportNearMissType(communication.type) ? null : communication.nearMissType,
      })),
    );
  }

  return ok(communications);
}

export async function POST(request: NextRequest, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;

  const auth = await requirePlantAccess(plantCode, [
    RoleCode.N1_CORPORATE,
    RoleCode.N2_PLANT_MANAGER,
    RoleCode.N3_SAFETY,
    RoleCode.N4_SUPERVISOR,
    RoleCode.N5_OPERATOR,
  ]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, createCommunicationInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const actorRole = "role" in auth ? auth.role : undefined;
  const initialStatus = initialStatusForCommunicationCreation(actorRole);

  if (parsed.data.quickAction && !isCommunicationLinkableStatus(initialStatus)) {
    return fail("COMMUNICATION_PENDING_VALIDATION", "This communication must be validated before actions or S-EWO can be linked.", 422);
  }

  const communication = await (async () => {
    try {
      return await CommunicationService.create({
        plantId: plant.id,
        payload: parsed.data,
        reporterUserId: auth.session.user.id,
        actorRole,
      });
    } catch (error) {
      if (error instanceof CommunicationValidationError) {
        return fail(error.code, error.message, error.status);
      }
      throw error;
    }
  })();
  if (communication instanceof Response) return communication;

  if (parsed.data.quickAction) {
    await ActionService.create({
      plantId: plant.id,
      actorUserId: auth.session.user.id,
      payload: {
        sourceType: ActionSourceType.COMMUNICATION,
        communicationId: communication.id,
        category: ActionCategory.CORRECTIVE,
        priority: parsed.data.quickAction.priority,
        title: parsed.data.quickAction.title,
        description: parsed.data.quickAction.description,
        ownerUserId: parsed.data.quickAction.ownerUserId,
        dueDate: parsed.data.quickAction.dueDate,
      },
    });
  }

  return ok(communication, { status: 201 });
}
