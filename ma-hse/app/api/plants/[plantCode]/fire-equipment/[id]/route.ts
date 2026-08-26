import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { FireEquipmentService } from "@/lib/services/fire-equipment-service";
import { decommissionFireEquipmentInput, updateFireEquipmentInput } from "@/lib/validation/dtos";

// Mirrors CREATE_ROLES in fire-equipment/route.ts: editing or decommissioning
// an equipment record is the same "who maintains this roster entry"
// precedent as creating it.
const MANAGE_ROLES: RoleCode[] = [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR];

export async function PATCH(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, MANAGE_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, updateFireEquipmentInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  try {
    const equipment = await FireEquipmentService.update(plant, id, parsed.data, auth.session.user.id);
    return ok({ equipment });
  } catch (error) {
    return fail("UPDATE_FIRE_EQUIPMENT_FAILED", error instanceof Error ? error.message : "Failed to update fire equipment", 422);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, MANAGE_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, decommissionFireEquipmentInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  try {
    await FireEquipmentService.decommission(plant, id, parsed.data, auth.session.user.id);
    return ok({ decommissionedId: id });
  } catch (error) {
    return fail("DECOMMISSION_FIRE_EQUIPMENT_FAILED", error instanceof Error ? error.message : "Failed to decommission fire equipment", 422);
  }
}
