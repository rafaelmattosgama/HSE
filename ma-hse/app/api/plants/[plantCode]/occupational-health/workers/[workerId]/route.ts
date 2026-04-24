import { z } from "zod";
import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { OccupationalHealthService } from "@/lib/services/occupational-health-service";
import { upsertOccupationalHealthWorkerInput } from "@/lib/validation/dtos";

const toggleWorkerInput = z.object({
  isActive: z.boolean(),
});

export async function PATCH(request: Request, context: { params: Promise<{ plantCode: string; workerId: string }> }) {
  const { plantCode, workerId } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, upsertOccupationalHealthWorkerInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const worker = await OccupationalHealthService.upsert(plant.id, parsed.data, workerId);
  return ok({ worker });
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string; workerId: string }> }) {
  const { plantCode, workerId } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, toggleWorkerInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  await OccupationalHealthService.setActive(plant.id, workerId, parsed.data.isActive);
  return ok({ workerId, isActive: parsed.data.isActive });
}
