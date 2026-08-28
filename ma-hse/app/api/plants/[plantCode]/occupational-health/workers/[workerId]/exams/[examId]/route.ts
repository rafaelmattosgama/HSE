import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { OccupationalHealthService } from "@/lib/services/occupational-health-service";
import { updateOccupationalHealthExamInput } from "@/lib/validation/dtos";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ plantCode: string; workerId: string; examId: string }> },
) {
  const { plantCode, workerId, examId } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY, RoleCode.N6_HR]);
  if ("error" in auth) return auth.error;
  const parsed = await parseBody(request, updateOccupationalHealthExamInput);
  if ("error" in parsed) return parsed.error;

  try {
    const plant = await getPlantByCode(plantCode);
    const worker = await OccupationalHealthService.updateExam(plant.id, workerId, examId, parsed.data, auth.session.user.id);
    return ok({ worker });
  } catch (error) {
    return fail("UPDATE_OCCUPATIONAL_HEALTH_EXAM_FAILED", error instanceof Error ? error.message : "Failed to update exam", 422);
  }
}
