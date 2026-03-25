import { ActionPriority, RoleCode } from "@prisma/client";
import { z } from "zod";
import { ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { getSlaConfig, setSlaConfig } from "@/lib/services/parameter-service";

const slaSchema = z.object({
  LOW: z.number().int().positive(),
  MEDIUM: z.number().int().positive(),
  HIGH: z.number().int().positive(),
});

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const sla = await getSlaConfig(plant.id);

  return ok(sla);
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, slaSchema);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  const sla = await setSlaConfig(plant.id, {
    LOW: parsed.data.LOW,
    MEDIUM: parsed.data.MEDIUM,
    HIGH: parsed.data.HIGH,
  } satisfies Record<ActionPriority, number>);

  return ok(sla);
}