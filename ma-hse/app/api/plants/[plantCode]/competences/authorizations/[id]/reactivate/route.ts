import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { CompetenceService } from "@/lib/services/competence-service";
import { reactivateAuthorizationInput } from "@/lib/validation/dtos";

// Not listed among the phase-2 routes in §9, but the service method is
// explicit in the phase-2 brief and the cell detail panel needs a working
// counterpart to "suspend" — gated the same way (§2.3).
const REACTIVATE_ROLES: RoleCode[] = [RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N6_HR];

export async function POST(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, REACTIVATE_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, reactivateAuthorizationInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  try {
    const authorization = await CompetenceService.reactivateAuthorization(
      plant.id,
      id,
      auth.session.user.id,
      parsed.data.note,
    );
    return ok(authorization);
  } catch (error) {
    return fail("REACTIVATE_AUTHORIZATION_FAILED", error instanceof Error ? error.message : "Failed to reactivate authorization", 422);
  }
}
