import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import {
  SAFETY_COMMUNICATION_APPROVED_CHANNEL,
  SAFETY_COMMUNICATION_N3_CHANNEL,
  SafetyCommunicationAlertService,
} from "@/lib/services/safety-communication-alert-service";

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const actorRole = "role" in auth ? auth.role : null;
  const channels = actorRole === RoleCode.N3_SAFETY
    ? [SAFETY_COMMUNICATION_N3_CHANNEL]
    : [SAFETY_COMMUNICATION_APPROVED_CHANNEL];
  const alerts = await SafetyCommunicationAlertService.listUnreadFloatingAlerts({
    plantId: plant.id,
    userId: auth.session.user.id,
    channels,
  });

  return ok(alerts);
}
