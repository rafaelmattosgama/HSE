import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { CompetenceService } from "@/lib/services/competence-service";
import { revokeAuthorizationInput } from "@/lib/validation/dtos";

// §2.3: revocation is definitive and stays with whoever can grant —
// N3_SAFETY only. N0_ADMIN and N1_CORPORATE pass through requirePlantAccess's
// global bypass. N2_PLANT_MANAGER and N4_SUPERVISOR can suspend but not revoke.
const REVOKE_ROLES: RoleCode[] = [RoleCode.N3_SAFETY, RoleCode.N6_HR];

export async function POST(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, REVOKE_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, revokeAuthorizationInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  try {
    const authorization = await CompetenceService.revokeAuthorization(plant.id, id, parsed.data.reason, auth.session.user.id);
    return ok(authorization);
  } catch (error) {
    return fail("REVOKE_AUTHORIZATION_FAILED", error instanceof Error ? error.message : "Failed to revoke authorization", 422);
  }
}
