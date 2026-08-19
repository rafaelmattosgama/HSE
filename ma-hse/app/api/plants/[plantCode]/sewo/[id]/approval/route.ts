import { RoleCode, SEWOStatus } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { logger } from "@/lib/logger";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { SewaService, SewoValidationError } from "@/lib/services/sewo-service";
import { approveSEWOInput, changeSewoDecisionInput } from "@/lib/validation/dtos";

async function requireN1CorporateApproval(plantCode: string) {
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE]);
  if ("error" in auth) return auth;

  const hasN1ValidationRole = auth.session.user.plantRoles.some((entry) => entry.role === RoleCode.N1_CORPORATE);
  if (!hasN1ValidationRole) {
    return { error: fail("FORBIDDEN", "S-EWO approval is restricted to N1 Corporate", 403) };
  }

  return auth;
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;

  const auth = await requireN1CorporateApproval(plantCode);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, approveSEWOInput);
  if ("error" in parsed) return parsed.error;

  try {
    const plant = await getPlantByCode(plantCode);
    const sewo = await prisma.sEWO.findFirst({ where: { id, plantId: plant.id, deletedAt: null } });
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
      "failed_to_approve_sewo",
    );
    return fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to approve S-EWO", 500);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requireN1CorporateApproval(plantCode);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, changeSewoDecisionInput);
  if ("error" in parsed) return parsed.error;

  try {
    const plant = await getPlantByCode(plantCode);
    const sewo = await prisma.sEWO.findFirst({ where: { id, plantId: plant.id, deletedAt: null } });
    if (!sewo) return fail("NOT_FOUND", "SEWO not found", 404);
    if (sewo.status !== SEWOStatus.APPROVED && sewo.status !== SEWOStatus.REJECTED) {
      return fail("INVALID_STATUS", "Only decided S-EWO records can have their corporate decision changed", 400);
    }

    const updated = await SewaService.changeCorporateDecision({
      sewoId: id,
      actorUserId: auth.session.user.id,
      payload: parsed.data,
    });

    return ok(updated);
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
      "failed_to_change_sewo_corporate_decision",
    );
    return fail("INTERNAL_ERROR", "Failed to change S-EWO corporate decision", 500);
  }
}
