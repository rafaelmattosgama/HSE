import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { CompetenceService } from "@/lib/services/competence-service";
import { registerTrainingInput } from "@/lib/validation/dtos";

// §2.3: N3_SAFETY and N4_SUPERVISOR register training; N0_ADMIN and
// N1_CORPORATE pass through requirePlantAccess's global bypass.
const REGISTER_ROLES: RoleCode[] = [RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR];

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, REGISTER_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, registerTrainingInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  try {
    const trainingRecord = await CompetenceService.registerTraining(plant.id, parsed.data, auth.session.user.id);
    return ok(trainingRecord, { status: 201 });
  } catch (error) {
    return fail("REGISTER_TRAINING_FAILED", error instanceof Error ? error.message : "Failed to register training", 422);
  }
}
