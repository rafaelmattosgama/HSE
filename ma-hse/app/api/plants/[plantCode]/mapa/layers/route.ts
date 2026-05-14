import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/prisma";
import { createMapLayerInput } from "@/lib/validation/dtos";

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [
    RoleCode.N1_CORPORATE,
    RoleCode.N2_PLANT_MANAGER,
    RoleCode.N3_SAFETY,
    RoleCode.N4_SUPERVISOR,
    RoleCode.N5_OPERATOR,
  ]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, createMapLayerInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  if (parsed.data.documentId) {
    await prisma.mapDocument.findFirstOrThrow({
      where: {
        id: parsed.data.documentId,
        plantId: plant.id,
      },
      select: { id: true },
    });
  }

  const layer = await prisma.mapLayer.create({
    data: {
      plantId: plant.id,
      documentId: parsed.data.documentId ?? null,
      name: parsed.data.name,
      description: parsed.data.description,
      color: parsed.data.color,
      icon: parsed.data.icon,
      sourceType: parsed.data.sourceType,
      isVisibleDefault: parsed.data.isVisibleDefault,
      sortOrder: parsed.data.sortOrder,
      metadataJson: parsed.data.metadataJson,
    },
  });

  return ok(layer, { status: 201 });
}
