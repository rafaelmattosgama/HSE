import { NextResponse } from "next/server";
import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { FireEquipmentTagConflictError, FireEquipmentTagService } from "@/lib/services/fire-equipment-tag-service";
import { assignFireEquipmentTagInput, bindFireEquipmentTagByUidInput } from "@/lib/validation/dtos";

// Mirrors CREATE_ROLES in fire-equipment/route.ts (Fase 0, ponto 2):
// assigning/replacing/binding a tag is equipment-record maintenance, same
// precedent as creating the equipment record itself.
const TAG_ROLES: RoleCode[] = [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR];

/**
 * One route, two payload shapes (§11 Fase 3's own INCLUI list asks for a
 * single POST) — presence of a non-empty tagUid picks the Web-NFC bind path
 * (bindByUid); its absence keeps the pre-existing manual/auto-code path
 * (assignOrReplaceTag) exactly as it worked before this phase. request is
 * cloned to peek at the shape without consuming the body parseBody still
 * needs to read.
 */
export async function POST(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, TAG_ROLES);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const peek = (await request.clone().json().catch(() => null)) as { tagUid?: unknown } | null;
  const isUidBind = Boolean(peek && typeof peek.tagUid === "string" && peek.tagUid.trim());

  if (isUidBind) {
    const parsed = await parseBody(request, bindFireEquipmentTagByUidInput);
    if ("error" in parsed) return parsed.error;

    try {
      const tag = await FireEquipmentTagService.bindByUid(plant, id, parsed.data, auth.session.user.id);
      return ok(tag, { status: 201 });
    } catch (error) {
      if (error instanceof FireEquipmentTagConflictError) {
        return NextResponse.json(
          {
            ok: false,
            errorCode: "FIRE_EQUIPMENT_TAG_CONFLICT",
            message: error.message,
            data: { equipmentId: error.equipmentId, equipmentInternalCode: error.equipmentInternalCode },
          },
          { status: 409 },
        );
      }
      return fail("BIND_FIRE_EQUIPMENT_TAG_FAILED", error instanceof Error ? error.message : "Failed to bind the tag", 422);
    }
  }

  const parsed = await parseBody(request, assignFireEquipmentTagInput);
  if ("error" in parsed) return parsed.error;

  try {
    const tag = await FireEquipmentTagService.assignOrReplaceTag(plant, id, parsed.data, auth.session.user.id);
    return ok(tag, { status: 201 });
  } catch (error) {
    return fail("ASSIGN_FIRE_EQUIPMENT_TAG_FAILED", error instanceof Error ? error.message : "Failed to assign the tag", 422);
  }
}
