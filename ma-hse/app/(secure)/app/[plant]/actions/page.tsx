import { CommunicationStatus, RoleCode } from "@prisma/client";
import { CreateActionQuick } from "@/components/feature/create-action-quick";
import { ActionsTable } from "@/components/feature/actions-table";
import { authOptions } from "@/lib/auth/options";
import {
  formatLocalizedActionSourceType,
} from "@/lib/actions-ui";
import { prisma } from "@/lib/prisma";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { localizeCommunicationCatalogRows } from "@/lib/services/communication-catalog-localization";
import { getLocalizedActionsUi } from "@/lib/services/actions-ui-localization";
import { getLocalizedCommunicationUi } from "@/lib/services/communication-ui-localization";
import { translateForViewer } from "@/lib/services/viewer-translation-service";
import { getUiDictionary } from "@/lib/ui-language";
import { getServerSession } from "next-auth";

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
  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });
  const uiLocale = await getServerUiLocale({
    userLanguage: session?.user.language,
    plantLanguage: plantRow.defaultLanguage,
  });
  const ui = getUiDictionary(uiLocale);

  const [actions, owners, communications] = await prisma.$transaction([
    prisma.action.findMany({
      where: {
        plantId: plantRow.id,
      },
      include: {
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
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.userPlantRole.findMany({
      where: {
        plantId: plantRow.id,
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
        plantId: plantRow.id,
        status: {
          in: LINKABLE_COMMUNICATION_STATUSES,
        },
      },
      orderBy: {
        eventDatetime: "desc",
      },
      take: 100,
    }),
  ]);
  const actorRole = session?.user.plantRoles.some((entry) => entry.role === RoleCode.N0_ADMIN)
    ? RoleCode.N0_ADMIN
    : session?.user.plantRoles.some((entry) => entry.role === RoleCode.N1_CORPORATE)
      ? RoleCode.N1_CORPORATE
      : session?.user.plantRoles.find((entry) => entry.plantCode === plant)?.role ?? null;
  const canDeleteActions = Boolean(actorRole && DELETE_ACTION_ROLES.includes(actorRole));

  const communicationUi = await getLocalizedCommunicationUi(uiLocale);
  const actionsUi = await getLocalizedActionsUi(uiLocale);
  const translatedTitles = await translateForViewer(uiLocale, actions.map((action) => action.title));
  const [localizedCommunicationAreas, localizedActionLocals] = await Promise.all([
    localizeCommunicationCatalogRows(
      actions
        .flatMap((action) => [
          action.communication?.area,
          action.sewo?.communication?.area,
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

  function resolveLocalLabel(row: (typeof actions)[number], index: number) {
    if (row.communication?.workstation?.name) return row.communication.workstation.name;
    if (row.communication?.areaId) return localizedAreaById.get(row.communication.areaId) ?? row.communication.area?.name ?? "-";
    if (row.sewo?.communication?.workstation?.name) return row.sewo.communication.workstation.name;
    if (row.sewo?.communication?.areaId) return localizedAreaById.get(row.sewo.communication.areaId) ?? row.sewo.communication.area?.name ?? "-";
    return localizedActionLocals[index] || row.sewo?.whereText || "-";
  }

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{ui.modules.actions}</h1>
      </header>

      <CreateActionQuick
        owners={owners.map((entry) => ({
          id: entry.userId,
          label: entry.user.name,
        }))}
        communicationOptions={communications.map((entry) => ({
          id: entry.id,
          label: `${entry.eventDatetime.toISOString().slice(0, 10)} | ${communicationUi.communicationTypeLabels[entry.type] ?? entry.type} | ${entry.reporterName}`,
        }))}
        labels={communicationUi.createActionQuick}
      />

      <ActionsTable
        plant={plant}
        canDelete={canDeleteActions}
        labels={actionsUi.table}
        statusLabels={actionsUi.statusLabels}
        priorityLabels={actionsUi.priorityLabels}
        actions={actions.map((row, index) => ({
          id: row.id,
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
                : formatLocalizedActionSourceType(row.sourceType, actionsUi),
          sourceHref:
            row.communicationId
              ? `/app/${plant}/communications/${row.communicationId}`
              : row.sewoId
                ? `/app/${plant}/sewo?sewoId=${row.sewoId}`
                : null,
          communicationId: row.communicationId,
          sewoId: row.sewoId,
          evidence: row.evidenceAttachments.map((entry) => ({
            id: entry.id,
            fileName: entry.fileName,
          })),
        }))}
      />
    </>
  );
}
