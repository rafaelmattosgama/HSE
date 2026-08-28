import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { OccupationalHealthService } from "@/lib/services/occupational-health-service";
import { createOccupationalHealthExamInput } from "@/lib/validation/dtos";

const EDIT_ROLES = [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY, RoleCode.N6_HR];

export async function POST(request: Request, context: { params: Promise<{ plantCode: string; workerId: string }> }) {
  const { plantCode, workerId } = await context.params;
  const auth = await requirePlantAccess(plantCode, EDIT_ROLES);
  if ("error" in auth) return auth.error;
  const parsed = await parseBody(request, createOccupationalHealthExamInput);
  if ("error" in parsed) return parsed.error;

  try {
    const plant = await getPlantByCode(plantCode);
    const worker = await OccupationalHealthService.createExam(plant.id, workerId, parsed.data, auth.session.user.id);
    return ok({ worker }, { status: 201 });
  } catch (error) {
    return fail("CREATE_OCCUPATIONAL_HEALTH_EXAM_FAILED", error instanceof Error ? error.message : "Failed to create exam", 422);
  }
}
