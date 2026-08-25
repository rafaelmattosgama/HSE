import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { FireEquipmentTagService } from "@/lib/services/fire-equipment-tag-service";
import { assignFireEquipmentTagInput } from "@/lib/validation/dtos";

// Mirrors CREATE_ROLES in fire-equipment/route.ts (Fase 0, ponto 2):
// assigning/replacing a tag is equipment-record maintenance, same precedent
// as creating the equipment record itself.
const TAG_ROLES: RoleCode[] = [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR];

export async function POST(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, TAG_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, assignFireEquipmentTagInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  try {
    const tag = await FireEquipmentTagService.assignOrReplaceTag(plant, id, parsed.data, auth.session.user.id);
    return ok(tag, { status: 201 });
  } catch (error) {
    return fail("ASSIGN_FIRE_EQUIPMENT_TAG_FAILED", error instanceof Error ? error.message : "Failed to assign the tag", 422);
  }
}
