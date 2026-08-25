import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { CompetenceService } from "@/lib/services/competence-service";
import { deleteCompetenceTypeInput, upsertCompetenceTypeInput } from "@/lib/validation/dtos";

// §2.7: the catalog belongs to the plant's N3_SAFETY, with N1_CORPORATE able
// to intervene. N0_ADMIN keeps read access (support) but is explicitly
// blocked from writing below. The guard bypasses N0/N1 unconditionally
// regardless of allowedRoles (see lib/rbac/evaluator.ts), so excluding N0
// from writes has to be a check after requirePlantAccess, not a shorter list.
const CATALOG_ROLES = [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY];

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, CATALOG_ROLES);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const types = await prisma.competenceType.findMany({
    where: { plantId: plant.id },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });

  return ok({ types });
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, CATALOG_ROLES);
  if ("error" in auth) return auth.error;
  if ("role" in auth && auth.role === RoleCode.N0_ADMIN) {
    return fail("FORBIDDEN", "O catálogo de competências é definido pelo N3 da planta", 403);
  }

  const parsed = await parseBody(request, upsertCompetenceTypeInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  try {
    const type = await CompetenceService.upsertCompetenceType(plant.id, parsed.data, auth.session.user.id);
    return ok({ type }, { status: 201 });
  } catch (error) {
    return fail("UPSERT_COMPETENCE_TYPE_FAILED", error instanceof Error ? error.message : "Failed to save competence type", 422);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, CATALOG_ROLES);
  if ("error" in auth) return auth.error;
  if ("role" in auth && auth.role === RoleCode.N0_ADMIN) {
    return fail("FORBIDDEN", "O catálogo de competências é definido pelo N3 da planta", 403);
  }

  const parsed = await parseBody(request, deleteCompetenceTypeInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  try {
    await CompetenceService.deactivateCompetenceType(plant.id, parsed.data.id, auth.session.user.id);
    return ok({ deletedId: parsed.data.id });
  } catch (error) {
    return fail("DEACTIVATE_COMPETENCE_TYPE_FAILED", error instanceof Error ? error.message : "Failed to deactivate competence type", 422);
  }
}
