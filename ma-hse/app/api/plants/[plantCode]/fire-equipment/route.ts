import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { FireEquipmentService } from "@/lib/services/fire-equipment-service";
import { createFireEquipmentInput } from "@/lib/validation/dtos";

const VIEW_ROLES: RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
  RoleCode.N5_OPERATOR,
];

// Mirrors ENROLL_ROLES in competences/route.ts: adding a new tracked
// equipment record to the module follows the same "who can add a new roster
// entry" precedent as enrolling a competence worker (Fase 0, ponto 2).
const CREATE_ROLES: RoleCode[] = [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR];

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, VIEW_ROLES);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const view = await FireEquipmentService.list(plant.id);

  return ok(view);
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, CREATE_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, createFireEquipmentInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  try {
    const equipment = await FireEquipmentService.create(plant, parsed.data, auth.session.user.id);
    return ok(equipment, { status: 201 });
  } catch (error) {
    return fail("CREATE_FIRE_EQUIPMENT_FAILED", error instanceof Error ? error.message : "Failed to create fire equipment", 422);
  }
}
