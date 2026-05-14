import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/prisma";
import { createMapFeatureInput } from "@/lib/validation/dtos";

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

  const parsed = await parseBody(request, createMapFeatureInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  if (parsed.data.layerId) {
    await prisma.mapLayer.findFirstOrThrow({
      where: {
        id: parsed.data.layerId,
        plantId: plant.id,
      },
      select: { id: true },
    });
  }

  const feature = await prisma.mapFeature.create({
    data: {
      plantId: plant.id,
      layerId: parsed.data.layerId ?? null,
      featureType: parsed.data.featureType,
      label: parsed.data.label,
      icon: parsed.data.icon,
      color: parsed.data.color,
      positionX: parsed.data.positionX,
      positionY: parsed.data.positionY,
      areaId: parsed.data.areaId ?? null,
      workstationId: parsed.data.workstationId ?? null,
      communicationId: parsed.data.communicationId ?? null,
      metadataJson: parsed.data.metadataJson,
    },
  });

  return ok(feature, { status: 201 });
}
