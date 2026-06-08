import { CommunicationStatus, RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { ActionService } from "@/lib/services/action-service";
import { createActionInput } from "@/lib/validation/dtos";
import { prisma } from "@/lib/prisma";

const LINKABLE_COMMUNICATION_STATUSES: CommunicationStatus[] = [
  CommunicationStatus.VALID_OPEN,
  CommunicationStatus.ONGOING,
  CommunicationStatus.CLOSED,
];
const VALIDATION_LINKABLE_COMMUNICATION_STATUSES: CommunicationStatus[] = [
  CommunicationStatus.SUBMITTED,
  CommunicationStatus.PENDING_VALIDATION,
];
const COMMUNICATION_VALIDATION_ROLES: RoleCode[] = [
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
];

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
  const actorRole = "role" in auth ? auth.role : null;

  const parsed = await parseBody(request, createActionInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  if (parsed.data.sourceType === "COMMUNICATION" && parsed.data.communicationId) {
    const communication = await prisma.communication.findFirst({
      where: {
        id: parsed.data.communicationId,
        plantId: plant.id,
        status: {
          in: [
            ...LINKABLE_COMMUNICATION_STATUSES,
            ...VALIDATION_LINKABLE_COMMUNICATION_STATUSES,
          ],
        },
      },
      select: { id: true, status: true },
    });

    if (!communication) {
      return fail("INVALID_COMMUNICATION", "Only active or pending validation communications can be linked to a new action", 422);
    }

    if (
      VALIDATION_LINKABLE_COMMUNICATION_STATUSES.includes(communication.status) &&
      (!actorRole || !COMMUNICATION_VALIDATION_ROLES.includes(actorRole))
    ) {
      return fail("INVALID_COMMUNICATION", "Only validation roles can create actions for pending validation communications", 422);
    }
  }

  const action = await ActionService.create({
    plantId: plant.id,
    actorUserId: auth.session.user.id,
    payload: parsed.data,
  });

  return ok(action, { status: action.idempotency.reusedExistingAction ? 200 : 201 });
}
