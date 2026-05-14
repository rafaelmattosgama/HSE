import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/prisma";
import { updateMapFeatureInput } from "@/lib/validation/dtos";

export async function PATCH(request: Request, context: { params: Promise<{ plantCode: string; featureId: string }> }) {
  const { plantCode, featureId } = await context.params;
  const auth = await requirePlantAccess(plantCode, [
    RoleCode.N1_CORPORATE,
    RoleCode.N2_PLANT_MANAGER,
    RoleCode.N3_SAFETY,
    RoleCode.N4_SUPERVISOR,
    RoleCode.N5_OPERATOR,
  ]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, updateMapFeatureInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  await prisma.mapFeature.findFirstOrThrow({
    where: {
      id: featureId,
      plantId: plant.id,
    },
    select: { id: true },
  });

  if (parsed.data.layerId) {
    await prisma.mapLayer.findFirstOrThrow({
      where: {
        id: parsed.data.layerId,
        plantId: plant.id,
      },
      select: { id: true },
    });
  }

  const feature = await prisma.mapFeature.update({
    where: { id: featureId },
    data: {
      ...(parsed.data.label !== undefined ? { label: parsed.data.label } : {}),
      ...(parsed.data.icon !== undefined ? { icon: parsed.data.icon } : {}),
      ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
      ...(parsed.data.positionX !== undefined ? { positionX: parsed.data.positionX } : {}),
      ...(parsed.data.positionY !== undefined ? { positionY: parsed.data.positionY } : {}),
      ...(parsed.data.layerId !== undefined ? { layerId: parsed.data.layerId } : {}),
      ...(parsed.data.metadataJson !== undefined ? { metadataJson: parsed.data.metadataJson } : {}),
    },
  });

  return ok(feature);
}

export async function DELETE(_request: Request, context: { params: Promise<{ plantCode: string; featureId: string }> }) {
  const { plantCode, featureId } = await context.params;
  const auth = await requirePlantAccess(plantCode, [
    RoleCode.N1_CORPORATE,
    RoleCode.N2_PLANT_MANAGER,
    RoleCode.N3_SAFETY,
    RoleCode.N4_SUPERVISOR,
    RoleCode.N5_OPERATOR,
  ]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  await prisma.mapFeature.findFirstOrThrow({
    where: {
      id: featureId,
      plantId: plant.id,
    },
    select: { id: true },
  });

  await prisma.mapFeature.delete({
    where: { id: featureId },
  });

  return ok({ success: true });
}
