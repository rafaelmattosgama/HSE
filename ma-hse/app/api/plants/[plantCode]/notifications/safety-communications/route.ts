import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { SafetyCommunicationAlertService } from "@/lib/services/safety-communication-alert-service";

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N4_SUPERVISOR]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const alerts = await SafetyCommunicationAlertService.listUnreadFloatingAlerts({
    plantId: plant.id,
    userId: auth.session.user.id,
  });

  return ok(alerts);
}
