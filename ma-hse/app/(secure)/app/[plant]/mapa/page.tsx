import { MasterDataEntityType } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { getFixedCommunicationLabels } from "@/lib/communication-labels";
import { formatCommunicationType } from "@/lib/helpers";
import { prisma } from "@/lib/prisma";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { localizeMasterDataRows } from "@/lib/services/master-data-translation-service";
import { MapaManager } from "@/components/feature/mapa-manager";

export default async function MapaPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
  const { plant } = await params;
  const session = await getServerSession(authOptions);
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
  const uiLocale = await getServerUiLocale({
    userLanguage: session?.user.language,
    plantLanguage: plantRow.defaultLanguage,
  });
  const [localizedAreas, localizedWorkstations] = await Promise.all([
    localizeMasterDataRows(MasterDataEntityType.AREA, areas, uiLocale),
    localizeMasterDataRows(MasterDataEntityType.WORKSTATION, workstations, uiLocale),
  ]);
  const areaNameById = new Map(localizedAreas.map((row) => [row.id, row.name]));
  const workstationNameById = new Map(localizedWorkstations.map((row) => [row.id, row.name]));
  const communicationTypeLabels = getFixedCommunicationLabels(uiLocale).communicationTypeLabels;

  const sourceDocuments = documents.map((document) => ({
    id: document.id,
    title: document.title,
    fileName: document.fileName,
    fileType: document.fileType,
    selectedLayerNames: Array.isArray(document.selectedLayerNames) ? document.selectedLayerNames.map(String) : [],
    downloadUrl: `/api/plants/${plant}/mapa/documents/${document.id}`,
  }));

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
      existing.label = `${communicationTypeLabels[communication.type] ?? formatCommunicationType(communication.type)} (${existing.count})`;
      continue;
    }
    groupedIncidentMap.set(key, {
      key,
      label: `${communicationTypeLabels[communication.type] ?? formatCommunicationType(communication.type)} (1)`,
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
          label: (feature.workstationId ? workstationNameById.get(feature.workstationId) : null)
            ?? (feature.areaId ? areaNameById.get(feature.areaId) : null)
            ?? feature.label,
          icon: feature.icon,
          color: feature.color,
          positionX: feature.positionX,
          positionY: feature.positionY,
        }))}
        autoIncidentFeatures={autoIncidentFeatures}
        areas={localizedAreas}
        workstations={localizedWorkstations}
      />
    </>
  );
}
