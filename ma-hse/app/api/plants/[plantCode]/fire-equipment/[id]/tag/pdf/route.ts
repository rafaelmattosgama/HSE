import { RoleCode } from "@prisma/client";
import { fail } from "@/lib/api";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { FireEquipmentTagService, tagUrl } from "@/lib/services/fire-equipment-tag-service";

export const runtime = "nodejs";

const VIEW_ROLES: RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
  RoleCode.N5_OPERATOR,
];

/**
 * §5.4: individual or batch label PDF. `id` in the path is the equipment
 * whose "Imprimir etiqueta" button was clicked; an optional `?ids=a,b,c`
 * query widens this to a batch (§7.2's "Imprimir etiquetas" lote action).
 */
export async function GET(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, VIEW_ROLES);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const requestUrl = new URL(request.url);
  const idsParam = requestUrl.searchParams.get("ids");
  const ids = idsParam
    ? Array.from(new Set(idsParam.split(",").map((value) => value.trim()).filter(Boolean)))
    : [id];

  const equipmentRows = await prisma.fireEquipment.findMany({
    where: { id: { in: ids }, plantId: plant.id },
    include: {
      fireEquipmentType: { select: { name: true } },
      tagAssignments: { where: { isActive: true }, select: { tagCode: true } },
    },
  });
  if (equipmentRows.length === 0) {
    return fail("NOT_FOUND", "Fire equipment not found", 404);
  }

  // A row can theoretically have an active assignment with no tagCode
  // (schema allows it, see the model comment), even though every current
  // binding path always mints one — there's simply nothing printable for
  // those, so they're excluded the same way equipment with no tag at all is.
  const labels = equipmentRows
    .filter((row) => row.tagAssignments[0]?.tagCode)
    .map((row) => ({
      internalCode: row.internalCode,
      fireEquipmentTypeName: row.fireEquipmentType.name,
      tagCode: row.tagAssignments[0].tagCode as string,
      url: tagUrl(row.tagAssignments[0].tagCode as string),
    }));

  if (labels.length === 0) {
    return fail("NO_TAG_ASSIGNED", "None of the selected equipment has an active tag yet", 422);
  }

  try {
    const pdf = await FireEquipmentTagService.buildTagLabelsPdf(labels);
    const filenameSuffix = labels.length > 1 ? "lote" : labels[0].internalCode;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="etiqueta_${filenameSuffix}.pdf"`,
      },
    });
  } catch (error) {
    return fail("EXPORT_FAILED", error instanceof Error ? error.message : "Failed to generate the label PDF.", 500);
  }
}
