import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { CompetenceService } from "@/lib/services/competence-service";
import { setCompetenceWorkerRequirementInput } from "@/lib/validation/dtos";

// §2.4: N3_SAFETY and N4_SUPERVISOR mark a competence required/not-required
// for a worker they know — the same roles allowed to register training and
// assessments (../../../trainings/route.ts). N0_ADMIN and N1_CORPORATE pass
// through requirePlantAccess's global bypass.
const REQUIREMENT_ROLES: RoleCode[] = [RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N6_HR];

export async function PATCH(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, REQUIREMENT_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, setCompetenceWorkerRequirementInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  try {
    const requirement = await CompetenceService.setWorkerCompetenceRequirement(
      plant.id,
      id,
      parsed.data.competenceTypeId,
      { isRequired: parsed.data.isRequired, notes: parsed.data.notes },
      auth.session.user.id,
    );
    return ok({ requirement });
  } catch (error) {
    return fail("SET_REQUIREMENT_FAILED", error instanceof Error ? error.message : "Failed to update the requirement", 422);
  }
}
