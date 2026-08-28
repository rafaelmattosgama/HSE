import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { OccupationalHealthService } from "@/lib/services/occupational-health-service";
import { upsertOccupationalHealthWorkerInput } from "@/lib/validation/dtos";

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY, RoleCode.N6_HR]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const workers = await OccupationalHealthService.list(plant.id, auth.session.user.language);
  return ok({ workers });
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY, RoleCode.N6_HR]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, upsertOccupationalHealthWorkerInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  try {
    const worker = await OccupationalHealthService.upsert(plant.id, parsed.data, undefined, auth.session.user.id);
    return ok({ worker }, { status: 201 });
  } catch (error) {
    return fail("CREATE_OCCUPATIONAL_HEALTH_WORKER_FAILED", error instanceof Error ? error.message : "Failed to create worker", 422);
  }
}
