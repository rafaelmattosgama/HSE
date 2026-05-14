import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { getPlantRepeatabilityAlertConfig, setPlantRepeatabilityAlertConfig } from "@/lib/services/parameter-service";
import { updateRepeatabilityAlertConfigInput } from "@/lib/validation/dtos";

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const config = await getPlantRepeatabilityAlertConfig(plant.id);

  return ok(config);
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, updateRepeatabilityAlertConfigInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  await setPlantRepeatabilityAlertConfig(plant.id, parsed.data);

  return ok(parsed.data);
}
