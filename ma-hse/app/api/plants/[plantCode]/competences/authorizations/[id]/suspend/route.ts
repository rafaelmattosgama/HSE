import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { CompetenceService } from "@/lib/services/competence-service";
import { suspendAuthorizationInput } from "@/lib/validation/dtos";

// §2.3: suspension is an immediate cautionary measure — N2_PLANT_MANAGER and
// N4_SUPERVISOR can also take it, unlike granting or revoking. N0_ADMIN and
// N1_CORPORATE pass through requirePlantAccess's global bypass.
const SUSPEND_ROLES: RoleCode[] = [RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR];

export async function POST(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, SUSPEND_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, suspendAuthorizationInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  try {
    const authorization = await CompetenceService.suspendAuthorization(plant.id, id, parsed.data.reason, auth.session.user.id);
    return ok(authorization);
  } catch (error) {
    return fail("SUSPEND_AUTHORIZATION_FAILED", error instanceof Error ? error.message : "Failed to suspend authorization", 422);
  }
}
