import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { CompetenceService } from "@/lib/services/competence-service";
import { deleteCompetenceRequirementInput, upsertCompetenceRequirementInput } from "@/lib/validation/dtos";

// §2.7: same rule as admin/competence-types — the matrix of requirements is
// part of the plant's catalog. N0_ADMIN keeps read access (support) but is
// blocked from writing below; see admin/competence-types/route.ts for why
// the guard's N0/N1 bypass means that has to be an explicit check.
const CATALOG_ROLES = [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY];

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, CATALOG_ROLES);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const locale = await getServerUiLocale({
    userLanguage: auth.session.user.language,
    plantLanguage: plant.defaultLanguage,
  });

  const [requirements, coverage] = await Promise.all([
    CompetenceService.listRequirements(plant.id, locale),
    CompetenceService.getRequirementCoverage(plant.id),
  ]);

  return ok({ requirements, coverage });
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, CATALOG_ROLES);
  if ("error" in auth) return auth.error;
  if ("role" in auth && auth.role === RoleCode.N0_ADMIN) {
    return fail("FORBIDDEN", "O catálogo de competências é definido pelo N3 da planta", 403);
  }

  const parsed = await parseBody(request, upsertCompetenceRequirementInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  try {
    const requirement = await CompetenceService.upsertRequirement(plant.id, parsed.data, auth.session.user.id);
    return ok({ requirement }, { status: 201 });
  } catch (error) {
    return fail("UPSERT_REQUIREMENT_FAILED", error instanceof Error ? error.message : "Failed to save requirement", 422);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, CATALOG_ROLES);
  if ("error" in auth) return auth.error;
  if ("role" in auth && auth.role === RoleCode.N0_ADMIN) {
    return fail("FORBIDDEN", "O catálogo de competências é definido pelo N3 da planta", 403);
  }

  const parsed = await parseBody(request, deleteCompetenceRequirementInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  try {
    await CompetenceService.deactivateRequirement(plant.id, parsed.data.id, auth.session.user.id);
    return ok({ deletedId: parsed.data.id });
  } catch (error) {
    return fail("DEACTIVATE_REQUIREMENT_FAILED", error instanceof Error ? error.message : "Failed to deactivate requirement", 422);
  }
}
