import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { CompetenceService, CompetenceValidationError } from "@/lib/services/competence-service";
import { grantAuthorizationInput } from "@/lib/validation/dtos";

// Admits N3_SAFETY of the plant; N0_ADMIN and N1_CORPORATE pass through
// requirePlantAccess's global bypass — intentional behavior, see §2.3 of
// docs/modulo-competencias-autorizacoes.md. N2_PLANT_MANAGER and
// N4_SUPERVISOR must NOT be able to grant: do not add them to this list.
const GRANT_ROLES: RoleCode[] = [RoleCode.N3_SAFETY, RoleCode.N6_HR];

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, GRANT_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, grantAuthorizationInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  try {
    const authorization = await CompetenceService.grantAuthorization(plant.id, parsed.data, auth.session.user.id);
    return ok(authorization, { status: 201 });
  } catch (error) {
    if (error instanceof CompetenceValidationError) return fail(error.code, error.message, error.status);
    return fail("GRANT_AUTHORIZATION_FAILED", error instanceof Error ? error.message : "Failed to grant authorization", 422);
  }
}
