import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { CompetenceService, CompetenceValidationError } from "@/lib/services/competence-service";
import { updateCompetenceRecordInput } from "@/lib/validation/dtos";

export async function PATCH(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N6_HR]);
  if ("error" in auth) return auth.error;
  const parsed = await parseBody(request, updateCompetenceRecordInput);
  if ("error" in parsed) return parsed.error;
  if (parsed.data.kind === "AUTHORIZATION_GRANTED" && "role" in auth && auth.role === RoleCode.N4_SUPERVISOR) {
    return fail("FORBIDDEN", "N4_SUPERVISOR cannot edit a formal authorization.", 403);
  }
  const plant = await getPlantByCode(plantCode);
  try {
    return ok(await CompetenceService.updateCompetenceRecord(plant.id, id, parsed.data, auth.session.user.id));
  } catch (error) {
    if (error instanceof CompetenceValidationError) return fail(error.code, error.message, error.status);
    return fail("UPDATE_ENTRY_FAILED", error instanceof Error ? error.message : "Failed to update record", 422);
  }
}
