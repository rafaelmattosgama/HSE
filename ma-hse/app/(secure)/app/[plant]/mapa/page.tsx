import { formatCommunicationType } from "@/lib/helpers";
import { prisma } from "@/lib/prisma";
import { StorageService } from "@/lib/services/storage-service";
import { MapaManager } from "@/components/feature/mapa-manager";

export default async function MapaPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
  const { plant } = await params;
  const plantRow = await prisma.plant.findUniqueOrThrow({
    where: { code: plant },
  });

  const [documents, layers, features, areas, workstations, communications] = await prisma.$transaction([
    prisma.mapDocument.findMany({
      where: { plantId: plantRow.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.mapLayer.findMany({
      where: { plantId: plantRow.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.mapFeature.findMany({
      where: { plantId: plantRow.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.area.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.workstation.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.communication.findMany({
      where: { plantId: plantRow.id },
      orderBy: { eventDatetime: "desc" },
      select: {
        id: true,
        type: true,
        areaId: true,
        workstationId: true,
      },
    }),
  ]);

  const sourceDocuments = await Promise.all(
    documents.map(async (document) => ({
      id: document.id,
      title: document.title,
      fileName: document.fileName,
      fileType: document.fileType,
      selectedLayerNames: Array.isArray(document.selectedLayerNames) ? document.selectedLayerNames.map(String) : [],
      downloadUrl: await StorageService.getPresignedDownloadUrl({ key: document.fileKey }),
    })),
  );

  const anchorByAreaId = new Map(
    features
      .filter((feature) => feature.featureType === "AREA" && feature.areaId)
      .map((feature) => [feature.areaId as string, feature]),
  );
  const anchorByWorkstationId = new Map(
    features
      .filter((feature) => feature.featureType === "WORKSTATION" && feature.workstationId)
      .map((feature) => [feature.workstationId as string, feature]),
  );

  const groupedIncidentMap = new Map<string, { key: string; label: string; positionX: number; positionY: number; count: number }>();
  for (const communication of communications) {
    const anchor =
      (communication.workstationId ? anchorByWorkstationId.get(communication.workstationId) : null) ??
      (communication.areaId ? anchorByAreaId.get(communication.areaId) : null);
    if (!anchor) continue;
    const anchorKey = communication.workstationId ?? communication.areaId ?? "unknown";
    const key = `${anchorKey}-${communication.type}`;
    const existing = groupedIncidentMap.get(key);
    if (existing) {
      existing.count += 1;
      existing.label = `${formatCommunicationType(communication.type)} (${existing.count})`;
      continue;
    }
    groupedIncidentMap.set(key, {
      key,
      label: `${formatCommunicationType(communication.type)} (1)`,
      positionX: anchor.positionX,
      positionY: anchor.positionY,
      count: 1,
    });
  }

  const autoIncidentFeatures = Array.from(groupedIncidentMap.values()).map((entry, index) => ({
    id: entry.key,
    label: entry.label,
    positionX: Math.min(98, entry.positionX + (index % 3) * 1.8),
    positionY: Math.min(98, entry.positionY + (index % 2) * 1.6),
    color: "#e11d48",
  }));

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">MAPA</h1>
      </header>

      <MapaManager
        plant={plant}
        sourceDocuments={sourceDocuments}
        layers={layers.map((layer) => ({
          id: layer.id,
          name: layer.name,
          color: layer.color,
          icon: layer.icon,
          sourceType: layer.sourceType,
          isVisibleDefault: layer.isVisibleDefault,
        }))}
        features={features.map((feature) => ({
          id: feature.id,
          layerId: feature.layerId,
          featureType: feature.featureType,
          label: feature.label,
          icon: feature.icon,
          color: feature.color,
          positionX: feature.positionX,
          positionY: feature.positionY,
        }))}
        autoIncidentFeatures={autoIncidentFeatures}
        areas={areas}
        workstations={workstations}
      />
    </>
  );
}
