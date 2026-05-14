import { MapLayerSourceType, RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/prisma";
import { createMapDocumentInput } from "@/lib/validation/dtos";

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

  const parsed = await parseBody(request, createMapDocumentInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const document = await prisma.mapDocument.create({
    data: {
      plantId: plant.id,
      title: parsed.data.title,
      fileKey: parsed.data.fileKey,
      fileName: parsed.data.fileName,
      contentType: parsed.data.contentType,
      fileType: parsed.data.fileType,
      importedLayerNames: parsed.data.importedLayerNames,
      selectedLayerNames: parsed.data.selectedLayerNames,
    },
  });

  if (parsed.data.selectedLayerNames?.length) {
    const existingLayers = await prisma.mapLayer.findMany({
      where: {
        plantId: plant.id,
        name: {
          in: parsed.data.selectedLayerNames,
        },
      },
      select: { name: true },
    });
    const existingNames = new Set(existingLayers.map((layer) => layer.name));
    const layersToCreate = parsed.data.selectedLayerNames
      .filter((name) => !existingNames.has(name))
      .map((name, index) => ({
        plantId: plant.id,
        documentId: document.id,
        name,
        description: "Imported from DWG selection",
        color: "#2563eb",
        icon: "▣",
        sourceType: MapLayerSourceType.DWG_IMPORTED,
        isVisibleDefault: true,
        sortOrder: index,
        metadataJson: { importedLayerName: name },
      }));

    if (layersToCreate.length) {
      await prisma.mapLayer.createMany({
        data: layersToCreate,
      });
    }
  }

  return ok(document, { status: 201 });
}
