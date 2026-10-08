import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { TRAINING_REGISTER_ROLES } from "@/lib/rbac/plant-training";
import { PlantTrainingError, PlantTrainingService } from "@/lib/services/plant-training-service";
import { createPlantTrainingInput } from "@/lib/validation/dtos";

type Context = { params: Promise<{ plantCode: string; id: string }> };

export async function PUT(request: Request, context: Context) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, TRAINING_REGISTER_ROLES);
  if ("error" in auth) return auth.error;
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) return fail("INVALID_TRAINING_RECORD_ID", "Invalid training record id", 400);
  const parsed = await parseBody(request, createPlantTrainingInput);
  if ("error" in parsed) return parsed.error;
  const plant = await getPlantByCode(plantCode);
  try {
    return ok(await PlantTrainingService.update(plant.id, id, parsed.data, auth.session.user.id));
  } catch (error) {
    if (error instanceof PlantTrainingError) return fail(error.code, error.message, error.status);
    throw error;
  }
}

export async function DELETE(_request: Request, context: Context) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, TRAINING_REGISTER_ROLES);
  if ("error" in auth) return auth.error;
  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) return fail("INVALID_TRAINING_RECORD_ID", "Invalid training record id", 400);
  const plant = await getPlantByCode(plantCode);
  try {
    return ok(await PlantTrainingService.delete(plant.id, id, auth.session.user.id));
  } catch (error) {
    if (error instanceof PlantTrainingError) return fail(error.code, error.message, error.status);
    throw error;
  }
}
