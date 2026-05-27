import { RoleCode } from "@prisma/client";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import {
  SafetyCommunicationAlertRecipientError,
  SafetyCommunicationAlertService,
} from "@/lib/services/safety-communication-alert-service";

const upsertRecipientInput = z.object({
  userId: z.string().uuid(),
  departmentId: z.string().uuid(),
});

const deleteRecipientInput = z.object({
  id: z.string().uuid(),
});

const ADMIN_ALERT_RECIPIENT_ROLES = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
] as const;

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [...ADMIN_ALERT_RECIPIENT_ROLES]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const [recipients, options] = await Promise.all([
    SafetyCommunicationAlertService.listRecipients(plant.id),
    SafetyCommunicationAlertService.listRecipientOptions(plant.id),
  ]);

  return ok({
    recipients,
    users: options.users,
    departments: options.departments,
  });
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [...ADMIN_ALERT_RECIPIENT_ROLES]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, upsertRecipientInput);
  if ("error" in parsed) return parsed.error;

  try {
    const plant = await getPlantByCode(plantCode);
    const recipient = await SafetyCommunicationAlertService.addRecipient({
      plantId: plant.id,
      userId: parsed.data.userId,
      departmentId: parsed.data.departmentId,
      actorUserId: auth.session.user.id,
    });

    return ok({ recipient }, { status: 201 });
  } catch (error) {
    if (error instanceof SafetyCommunicationAlertRecipientError) {
      return fail(error.code, error.message, error.status);
    }

    throw error;
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [...ADMIN_ALERT_RECIPIENT_ROLES]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, deleteRecipientInput);
  if ("error" in parsed) return parsed.error;

  try {
    const plant = await getPlantByCode(plantCode);
    const removed = await SafetyCommunicationAlertService.removeRecipient({
      id: parsed.data.id,
      plantId: plant.id,
      actorUserId: auth.session.user.id,
    });

    if (!removed) {
      return fail("RECIPIENT_NOT_FOUND", "Alert recipient not found.", 404);
    }

    return ok({
      recipientId: parsed.data.id,
    });
  } catch (error) {
    if (error instanceof SafetyCommunicationAlertRecipientError) {
      return fail(error.code, error.message, error.status);
    }

    throw error;
  }
}
