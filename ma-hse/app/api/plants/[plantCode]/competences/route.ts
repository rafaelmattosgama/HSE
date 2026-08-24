import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { CompetenceService } from "@/lib/services/competence-service";
import { enrollCompetenceWorkersInput } from "@/lib/validation/dtos";

const VIEW_ROLES: RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
  RoleCode.N5_OPERATOR,
];

const ENROLL_ROLES: RoleCode[] = [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR];

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, VIEW_ROLES);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const locale = await getServerUiLocale({
    userLanguage: auth.session.user.language,
    plantLanguage: plant.defaultLanguage,
  });

  const role = "role" in auth ? auth.role : RoleCode.N5_OPERATOR;
  const matrix = await CompetenceService.list(plant.id, locale, { role, userId: auth.session.user.id });

  return ok(matrix);
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, ENROLL_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, enrollCompetenceWorkersInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  try {
    const enrolled = await CompetenceService.enroll(plant.id, parsed.data, auth.session.user.id);
    return ok({ enrolled: enrolled.length }, { status: 201 });
  } catch (error) {
    return fail("ENROLL_FAILED", error instanceof Error ? error.message : "Failed to enroll workers", 422);
  }
}
