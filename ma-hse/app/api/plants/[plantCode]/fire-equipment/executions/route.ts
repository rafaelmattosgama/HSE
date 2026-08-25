import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { FireEquipmentService } from "@/lib/services/fire-equipment-service";
import { createFireChecklistExecutionInput } from "@/lib/validation/dtos";

// Mirrors registerTrainingInput's REGISTER_ROLES in competences/trainings/route.ts
// (§2.4): registering a checklist execution — whether the in-person quarterly
// round or the a-posteriori annual maintenance record — is the same kind of
// action as registering training, always done by someone with an app account.
const REGISTER_ROLES: RoleCode[] = [RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR];

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, REGISTER_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, createFireChecklistExecutionInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  try {
    const result = await FireEquipmentService.recordExecution(plant, parsed.data, auth.session.user.id);
    return ok(result, { status: 201 });
  } catch (error) {
    return fail(
      "RECORD_FIRE_CHECKLIST_EXECUTION_FAILED",
      error instanceof Error ? error.message : "Failed to record the checklist execution",
      422,
    );
  }
}
