import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { ActionService, ActionValidationError } from "@/lib/services/action-service";
import { createActionFollowUpInput } from "@/lib/validation/dtos";

const FOLLOW_UP_ROLES = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
  RoleCode.N5_OPERATOR,
  RoleCode.N6_HR,
];

const MANAGE_ALL_ACTIONS_ROLES = new Set<RoleCode>([
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
]);

export async function POST(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, FOLLOW_UP_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, createActionFollowUpInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const action = await prisma.action.findFirst({
    where: { id, plantId: plant.id },
    select: { id: true, ownerUserId: true, coOwners: { select: { userId: true } } },
  });
  if (!action) return fail("NOT_FOUND", "Action not found", 404);

  const actorRole = "role" in auth ? auth.role : null;
  const hasGlobalManageRole = auth.session.user.plantRoles.some((entry) =>
    entry.role === RoleCode.N0_ADMIN || entry.role === RoleCode.N1_CORPORATE,
  );
  const canManageAny = hasGlobalManageRole || Boolean(actorRole && MANAGE_ALL_ACTIONS_ROLES.has(actorRole));
  const isAssigned = action.ownerUserId === auth.session.user.id
    || action.coOwners.some((entry) => entry.userId === auth.session.user.id);
  if (!canManageAny && !isAssigned) return fail("FORBIDDEN", "You can only update actions assigned to you", 403);

  try {
    const update = await ActionService.addFollowUp({
      actionId: id,
      actorUserId: auth.session.user.id,
      payload: parsed.data,
    });
    return ok(update, { status: 201 });
  } catch (error) {
    if (error instanceof ActionValidationError) return fail(error.code, error.message, error.status);
    return fail("FOLLOW_UP_FAILED", error instanceof Error ? error.message : "Failed to add action update", 422);
  }
}
