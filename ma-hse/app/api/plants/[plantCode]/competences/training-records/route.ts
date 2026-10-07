import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { TRAINING_REGISTER_ROLES, TRAINING_VIEW_ROLES } from "@/lib/rbac/plant-training";
import { PlantTrainingError, PlantTrainingService } from "@/lib/services/plant-training-service";
import { createPlantTrainingInput } from "@/lib/validation/dtos";

type Context = { params: Promise<{ plantCode: string }> };

export async function GET(_request: Request, context: Context) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, TRAINING_VIEW_ROLES);
  if ("error" in auth) return auth.error;
  if (!("role" in auth)) return fail("FORBIDDEN", "Insufficient role", 403);
  const plant = await getPlantByCode(plantCode);
  return ok(await PlantTrainingService.list(plant.id, { role: auth.role, userId: auth.session.user.id }));
}

export async function POST(request: Request, context: Context) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, TRAINING_REGISTER_ROLES);
  if ("error" in auth) return auth.error;
  const parsed = await parseBody(request, createPlantTrainingInput);
  if ("error" in parsed) return parsed.error;
  const plant = await getPlantByCode(plantCode);
  try {
    return ok(await PlantTrainingService.create(plant.id, parsed.data, auth.session.user.id), { status: 201 });
  } catch (error) {
    if (error instanceof PlantTrainingError) return fail(error.code, error.message, error.status);
    throw error;
  }
}
