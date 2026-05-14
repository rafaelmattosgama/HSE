import { RoleCode } from "@prisma/client";
import { z } from "zod";
import { ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { DEFAULT_MODULE_TOGGLES, MODULE_TOGGLES_PARAMETER_KEY } from "@/lib/modules";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";

const updateModulesInput = z.object({
  modules: z.record(z.string(), z.boolean()),
});

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE]);
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
    modules: {
      ...DEFAULT_MODULE_TOGGLES,
      ...((parameter?.valueJson as Record<string, boolean> | null) ?? {}),
    },
  });
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, updateModulesInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const modules = {
    ...DEFAULT_MODULE_TOGGLES,
    ...parsed.data.modules,
  };

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
