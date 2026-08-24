import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { CompetenceService } from "@/lib/services/competence-service";
import { updateCompetenceWorkerRoleInput } from "@/lib/validation/dtos";

const VIEW_ROLES: RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
  RoleCode.N5_OPERATOR,
];

// Mirrors ENROLL_ROLES in ../../route.ts: editing roleName is part of
// managing the same enrollment record, so the same roles that can enroll a
// worker can also correct their function.
const UPDATE_ROLE_ROLES: RoleCode[] = [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR];

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, VIEW_ROLES);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const locale = await getServerUiLocale({
    userLanguage: auth.session.user.language,
    plantLanguage: plant.defaultLanguage,
  });

  const role = "role" in auth ? auth.role : RoleCode.N5_OPERATOR;
  const profile = await CompetenceService.getWorkerProfile(plant.id, id, locale, {
    role,
    userId: auth.session.user.id,
  });

  if (!profile) return fail("NOT_FOUND", "Worker not found", 404);

  return ok(profile);
}

/** §3.2 note: fixes the ROLE-scope key so requirement rules can resolve for this worker; triggers a full recompute. */
export async function PATCH(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, UPDATE_ROLE_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, updateCompetenceWorkerRoleInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  try {
    const worker = await CompetenceService.updateWorkerRole(plant.id, id, parsed.data, auth.session.user.id);
    return ok({ worker });
  } catch (error) {
    return fail("UPDATE_ROLE_FAILED", error instanceof Error ? error.message : "Failed to update worker role", 422);
  }
}
