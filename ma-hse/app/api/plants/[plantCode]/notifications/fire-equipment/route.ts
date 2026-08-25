import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { FireEquipmentAlertService } from "@/lib/services/fire-equipment-alert-service";

const VIEW_ROLES: RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
  RoleCode.N5_OPERATOR,
];

/** §8 exception: polling only for FIRE_EQUIPMENT_URGENT (NON_CONFORMITY_FOUND) — everything else goes through RepeatabilityAlertModal. */
export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, VIEW_ROLES);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const alerts = await FireEquipmentAlertService.listUnreadUrgentAlerts({
    plantId: plant.id,
    plantCode,
    userId: auth.session.user.id,
  });

  return ok(alerts);
}
