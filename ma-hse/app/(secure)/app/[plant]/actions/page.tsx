import { CreateActionQuick } from "@/components/feature/create-action-quick";
import { ActionsTable } from "@/components/feature/actions-table";
import { prisma } from "@/lib/prisma";
import { translateForViewer } from "@/lib/services/viewer-translation-service";
import { getLocale } from "next-intl/server";

export default async function ActionsPage({ params }: { params: Promise<{ plant: string }> }) {
  const { plant } = await params;
  const locale = await getLocale();
  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });

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
      },
      orderBy: {
        eventDatetime: "desc",
      },
      take: 100,
    }),
  ]);
  const translatedTitles = await translateForViewer(locale, actions.map((action) => action.title));

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Action Plan (CAPA)</h1>
        <p className="mt-1 text-sm text-slate-600">
          Create manual actions or link them to a communication. Open each row to close actions with comment and optional evidence.
        </p>
      </header>

      <CreateActionQuick
        owners={owners.map((entry) => ({
          id: entry.userId,
          label: entry.user.name,
        }))}
        communicationOptions={communications.map((entry) => ({
          id: entry.id,
          label: `${entry.eventDatetime.toISOString().slice(0, 10)} | ${entry.type} | ${entry.reporterName}`,
        }))}
      />

      <ActionsTable
        plant={plant}
        actions={actions.map((row, index) => ({
          id: row.id,
          sequenceNumber: row.sequenceNumber,
          title: translatedTitles[index] ?? row.title,
          priority: row.priority,
          status: row.status,
          ownerName: row.ownerUser.name,
          dueDate: row.dueDate.toISOString().slice(0, 10),
          local:
            row.communication?.workstation?.name ??
            row.communication?.area?.name ??
            row.sewo?.communication?.workstation?.name ??
            row.sewo?.communication?.area?.name ??
            row.sewo?.whereText ??
            "-",
          sourceLabel:
            row.sourceType === "MANUAL"
              ? "Manual"
              : row.communicationId
                ? "Communication"
                : row.sewoId
                  ? "S-EWO"
                  : row.sourceType,
          sourceHref:
            row.communicationId
              ? `/app/${plant}/communications/${row.communicationId}`
              : row.sewoId
                ? `/app/${plant}/sewo`
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
