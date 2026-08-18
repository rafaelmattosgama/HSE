import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { MODULE_TOGGLES_PARAMETER_KEY, moduleTogglesInputSchema, resolveModuleToggles } from "@/lib/modules";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const parameter = await prisma.systemParameter.findUnique({
    where: {
      plantId_key: {
        plantId: plant.id,
        key: MODULE_TOGGLES_PARAMETER_KEY,
      },
    },
  });

  return ok({
    modules: resolveModuleToggles(parameter?.valueJson),
  });
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, moduleTogglesInputSchema);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const modules = resolveModuleToggles(parsed.data.modules);

  await prisma.systemParameter.upsert({
    where: {
      plantId_key: {
        plantId: plant.id,
        key: MODULE_TOGGLES_PARAMETER_KEY,
      },
    },
    update: {
      valueJson: modules,
    },
    create: {
      plantId: plant.id,
      key: MODULE_TOGGLES_PARAMETER_KEY,
      valueJson: modules,
    },
  });

  return ok({ modules });
}
