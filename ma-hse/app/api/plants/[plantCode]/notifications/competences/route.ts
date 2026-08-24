import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { CompetenceAlertService } from "@/lib/services/competence-alert-service";

const VIEW_ROLES: RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
  RoleCode.N5_OPERATOR,
];

/** §7.1 exception: polling only for COMPETENCE_URGENT (suspend/revoke) — everything else goes through RepeatabilityAlertModal. */
export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, VIEW_ROLES);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const alerts = await CompetenceAlertService.listUnreadUrgentAlerts({
    plantId: plant.id,
    plantCode,
    userId: auth.session.user.id,
  });

  return ok(alerts);
}
