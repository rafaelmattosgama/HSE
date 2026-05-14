import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/prisma";
import { contractorToggleActiveInput } from "@/lib/validation/dtos";

export async function PATCH(request: Request, context: { params: Promise<{ plantCode: string; workerId: string }> }) {
  const { plantCode, workerId } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N3_SAFETY, RoleCode.N1_CORPORATE]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, contractorToggleActiveInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  await prisma.externalWorker.findFirstOrThrow({
    where: {
      id: workerId,
      company: {
        plantId: plant.id,
      },
    },
    select: { id: true },
  });

  const worker = await prisma.externalWorker.update({
    where: { id: workerId },
    data: { isActive: parsed.data.isActive },
  });

  return ok(worker);
}
