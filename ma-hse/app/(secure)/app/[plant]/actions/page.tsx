import { CommunicationStatus, MasterDataEntityType, RoleCode } from "@prisma/client";
import { CreateActionQuick } from "@/components/feature/create-action-quick";
import { ActionsTable } from "@/components/feature/actions-table";
import { authOptions } from "@/lib/auth/options";
import {
  formatLocalizedActionManualOrigin,
  formatLocalizedActionSourceType,
} from "@/lib/actions-ui";
import { prisma } from "@/lib/prisma";
import { isAllPlantsScope } from "@/lib/plant-scope";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { getLocalizedActionsUi } from "@/lib/services/actions-ui-localization";
import { getLocalizedCommunicationUi } from "@/lib/services/communication-ui-localization";
import { localizeMasterDataRows } from "@/lib/services/master-data-translation-service";
import { translateForViewer } from "@/lib/services/viewer-translation-service";
import { getUiDictionary } from "@/lib/ui-language";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

const DELETE_ACTION_ROLES: RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N3_SAFETY,
];

const LINKABLE_COMMUNICATION_STATUSES: CommunicationStatus[] = [
  CommunicationStatus.VALID_OPEN,
  CommunicationStatus.ONGOING,
  CommunicationStatus.CLOSED,
];

function isPresent<T>(value: T): value is NonNullable<T> {
  return value != null;
}

export default async function ActionsPage({ params }: { params: Promise<{ plant: string }> }) {
  const { plant } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const isAllPlants = isAllPlantsScope(plant);
  const hasGlobalPlantAccess = session.user.plantRoles.some((entry) => entry.role === RoleCode.N0_ADMIN || entry.role === RoleCode.N1_CORPORATE);
  const scopedPlantCodes = Array.from(
    new Set(session.user.plantRoles.map((entry) => entry.plantCode).filter((code): code is string => Boolean(code))),
  );
  const plantRows = isAllPlants
    ? await prisma.plant.findMany({
        where: hasGlobalPlantAccess ? { isActive: true } : { code: { in: scopedPlantCodes }, isActive: true },
        orderBy: { code: "asc" },
      })
    : [await prisma.plant.findUniqueOrThrow({ where: { code: plant } })];
  if (isAllPlants && plantRows.length <= 1) {
    if (!plantRows[0]?.code && !scopedPlantCodes[0]) redirect("/app/corporate");
    redirect(`/app/${plantRows[0]?.code ?? scopedPlantCodes[0]}/actions`);
  }
  const uiLocale = await getServerUiLocale({
    userLanguage: session.user.language,
    plantLanguage: isAllPlants ? undefined : plantRows[0]?.defaultLanguage,
  });
  const ui = getUiDictionary(uiLocale);

  const [actions, owners, communications, sewoRecords, smatAudits] = await prisma.$transaction([
    prisma.action.findMany({
      where: {
        plantId: { in: plantRows.map((row) => row.id) },
      },
      include: {
        plant: true,
        ownerUser: true,
        evidenceAttachments: true,
        communication: {
          include: {
            area: true,
            workstation: true,
          },
        },
        sewo: {
          include: {
            communication: {
              include: {
                area: true,
                workstation: true,
              },
            },
          },
        },
        smatLinks: {
          include: {
            smatAudit: true,
          },
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.userPlantRole.findMany({
      where: {
        plantId: { in: plantRows.map((row) => row.id) },
        user: {
          isActive: true,
        },
      },
      include: {
        user: true,
      },
      orderBy: {
        user: {
          name: "asc",
        },
      },
    }),
    prisma.communication.findMany({
      where: {
        plantId: { in: plantRows.map((row) => row.id) },
        status: {
          in: LINKABLE_COMMUNICATION_STATUSES,
        },
      },
      orderBy: {
        eventDatetime: "desc",
      },
      take: 100,
    }),
    prisma.sEWO.findMany({
      where: {
        plantId: { in: plantRows.map((row) => row.id) },
        deletedAt: null,
      },
      orderBy: [{ analysisDate: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.smatAudit.findMany({
      where: {
        plantId: { in: plantRows.map((row) => row.id) },
      },
      orderBy: [{ auditDate: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
  ]);
  const actorRole = session?.user.plantRoles.some((entry) => entry.role === RoleCode.N0_ADMIN)
    ? RoleCode.N0_ADMIN
    : session?.user.plantRoles.some((entry) => entry.role === RoleCode.N1_CORPORATE)
      ? RoleCode.N1_CORPORATE
      : isAllPlants
        ? session.user.plantRoles.find((entry) => entry.plantCode)?.role ?? null
        : session.user.plantRoles.find((entry) => entry.plantCode === plant)?.role ?? null;
  const canDeleteActions = Boolean(actorRole && DELETE_ACTION_ROLES.includes(actorRole));

  const communicationUi = await getLocalizedCommunicationUi(uiLocale);
  const actionsUi = await getLocalizedActionsUi(uiLocale);
  const translatedTitles = await translateForViewer(uiLocale, actions.map((action) => action.title));
  const [localizedCommunicationAreas, localizedCommunicationWorkstations, localizedActionLocals] = await Promise.all([
    localizeMasterDataRows(
      MasterDataEntityType.AREA,
      actions
        .flatMap((action) => [
          action.communication?.area,
          action.sewo?.communication?.area,
        ])
        .filter(isPresent),
      uiLocale,
    ),
    localizeMasterDataRows(
      MasterDataEntityType.WORKSTATION,
      actions
        .flatMap((action) => [
          action.communication?.workstation,
          action.sewo?.communication?.workstation,
        ])
        .filter(isPresent),
      uiLocale,
    ),
    translateForViewer(
      uiLocale,
      actions.map((action) => action.sewo?.whereText ?? ""),
    ),
  ]);
  const localizedAreaById = new Map(localizedCommunicationAreas.map((area) => [area.id, area.name]));
  const localizedWorkstationById = new Map(localizedCommunicationWorkstations.map((workstation) => [workstation.id, workstation.name]));

  function resolveLocalLabel(row: (typeof actions)[number], index: number) {
    if (row.communication?.workstationId) return localizedWorkstationById.get(row.communication.workstationId) ?? row.communication.workstation?.name ?? "-";
    if (row.communication?.areaId) return localizedAreaById.get(row.communication.areaId) ?? row.communication.area?.name ?? "-";
    if (row.sewo?.communication?.workstationId) return localizedWorkstationById.get(row.sewo.communication.workstationId) ?? row.sewo.communication.workstation?.name ?? "-";
    if (row.sewo?.communication?.areaId) return localizedAreaById.get(row.sewo.communication.areaId) ?? row.sewo.communication.area?.name ?? "-";
    return localizedActionLocals[index] || row.sewo?.whereText || "-";
  }

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{ui.modules.actions}</h1>
      </header>

      {!isAllPlants ? (
        <CreateActionQuick
          owners={owners.map((entry) => ({
            id: entry.userId,
            label: entry.user.name,
          }))}
          communicationOptions={communications.map((entry) => ({
            id: entry.id,
            label: `${entry.codigoCompleto ?? entry.codigoAbreviado ?? "Requires code update"} | ${entry.eventDatetime.toISOString().slice(0, 10)} | ${communicationUi.communicationTypeLabels[entry.type] ?? entry.type} | ${entry.reporterName}`,
          }))}
          sewoOptions={sewoRecords.map((entry) => ({
            id: entry.id,
            label: `${entry.codigoSewo ?? "S-EWO"} | ${entry.analysisDate.toISOString().slice(0, 10)} | ${entry.whoText}`,
          }))}
          smatOptions={smatAudits.map((entry) => ({
            id: entry.id,
            label: `SMAT | ${entry.auditDate.toISOString().slice(0, 10)} | ${entry.auditorName} | ${entry.locationExamined || entry.areaExamined || "-"}`,
          }))}
          labels={communicationUi.createActionQuick}
        />
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          Para criar acoes, selecione uma planta especifica no seletor.
        </div>
      )}

      <ActionsTable
        plant={plant}
        canDelete={canDeleteActions}
        labels={actionsUi.table}
        statusLabels={actionsUi.statusLabels}
        priorityLabels={actionsUi.priorityLabels}
        showPlant={isAllPlants}
        actions={actions.map((row, index) => ({
          id: row.id,
          plantCode: row.plant.code,
          plantName: row.plant.name,
          sequenceNumber: row.sequenceNumber,
          title: translatedTitles[index] ?? row.title,
          description: row.description,
          level: row.level,
          priority: row.priority,
          status: row.status,
          ownerName: row.ownerUser.name,
          dueDate: row.dueDate.toISOString().slice(0, 10),
          closedDate: row.closedAt ? row.closedAt.toISOString().slice(0, 10) : null,
          local: resolveLocalLabel(row, index),
          sourceLabel:
            row.communicationId
              ? formatLocalizedActionSourceType("COMMUNICATION", actionsUi)
              : row.sewoId
                ? formatLocalizedActionSourceType("SEWO", actionsUi)
                : row.smatLinks.length > 0
                  ? formatLocalizedActionSourceType("SMAT", actionsUi)
                : formatLocalizedActionSourceType(row.sourceType, actionsUi),
          sourceHref:
            row.communicationId
              ? `/app/${row.plant.code}/communications/${row.communicationId}`
              : row.sewoId
                ? `/app/${row.plant.code}/sewo?sewoId=${row.sewoId}`
                : row.smatLinks.length > 0
                  ? `/app/${row.plant.code}/smat`
                : null,
          manualOrigin: formatLocalizedActionManualOrigin(row.manualOrigin, actionsUi),
          communicationId: row.communicationId,
          communicationCode: row.communication?.codigoCompleto ?? row.communication?.codigoAbreviado ?? null,
          sewoId: row.sewoId,
          sewoCode: row.sewo?.codigoSewo ?? null,
          smatAuditId: row.smatLinks[0]?.smatAuditId ?? null,
          smatCode: row.smatLinks[0]?.smatAudit
            ? `SMAT | ${row.smatLinks[0].smatAudit.auditDate.toISOString().slice(0, 10)} | ${row.smatLinks[0].smatAudit.auditorName}`
            : null,
          evidence: row.evidenceAttachments.map((entry) => ({
            id: entry.id,
            fileName: entry.fileName,
          })),
        }))}
      />
    </>
  );
}
