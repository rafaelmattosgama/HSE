import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { FireEquipmentTagService } from "@/lib/services/fire-equipment-tag-service";
import { tagLookupInput } from "@/lib/validation/dtos";

// Same role set as [id]/tag — an internal lookup a signed-in officer's app
// makes right after reading a chip, never a URL the physical tag itself
// carries (that's /scie/[tagCode], public, unauthenticated).
const TAG_ROLES: RoleCode[] = [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR];

export async function GET(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, TAG_ROLES);
  if ("error" in auth) return auth.error;

  const tagUid = new URL(request.url).searchParams.get("tagUid");
  const parsed = tagLookupInput.safeParse({ tagUid });
  if (!parsed.success) {
    return fail("INVALID_INPUT", "tagUid query parameter is required", 422);
  }

  const plant = await getPlantByCode(plantCode);
  // §5.1 rule 3: an unrecognized uid is a normal outcome, not an error —
  // equipment comes back null, still a 200.
  const equipment = await FireEquipmentTagService.resolveByUid(plant.id, parsed.data.tagUid);
  return ok({ equipment });
}
