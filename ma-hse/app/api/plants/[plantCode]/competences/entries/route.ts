import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { CompetenceService, CompetenceValidationError } from "@/lib/services/competence-service";
import { registerCompetenceEntryInput } from "@/lib/validation/dtos";

// N6_HR has the same Competences capability as N3_SAFETY. N4 can enter
// training/assessment but is deliberately blocked from an authorization.
const ENTRY_ROLES: RoleCode[] = [RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N6_HR];

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, ENTRY_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, registerCompetenceEntryInput);
  if ("error" in parsed) return parsed.error;

  if (parsed.data.authorization && "role" in auth && auth.role === RoleCode.N4_SUPERVISOR) {
    return fail("FORBIDDEN", "N4_SUPERVISOR cannot grant a formal authorization; only register training and assessment.", 403);
  }

  const plant = await getPlantByCode(plantCode);
  try {
    const entry = await CompetenceService.registerCompetenceEntry(plant.id, parsed.data, auth.session.user.id);
    return ok(entry, { status: 201 });
  } catch (error) {
    if (error instanceof CompetenceValidationError) {
      return fail(error.code, error.message, error.status);
    }
    return fail("REGISTER_ENTRY_FAILED", error instanceof Error ? error.message : "Failed to register the entry", 422);
  }
}
