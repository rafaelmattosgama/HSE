import { Prisma, RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { TRAINING_CATALOG_ROLES } from "@/lib/rbac/plant-training";
import { PlantTrainingError, PlantTrainingService } from "@/lib/services/plant-training-service";
import { upsertPlantTrainingTopicInput } from "@/lib/validation/dtos";

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, TRAINING_CATALOG_ROLES);
  if ("error" in auth) return auth.error;
  if (!("role" in auth) || auth.role === RoleCode.N0_ADMIN) return fail("FORBIDDEN", "The training catalog is managed by N1 and N3", 403);
  const parsed = await parseBody(request, upsertPlantTrainingTopicInput);
  if ("error" in parsed) return parsed.error;
  const plant = await getPlantByCode(plantCode);
  try {
    return ok(await PlantTrainingService.saveTopic(plant.id, parsed.data, auth.session.user.id), { status: parsed.data.id ? 200 : 201 });
  } catch (error) {
    if (error instanceof PlantTrainingError) return fail(error.code, error.message, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return fail("TRAINING_TOPIC_DUPLICATE", "A topic with this name already exists", 409);
    throw error;
  }
}
