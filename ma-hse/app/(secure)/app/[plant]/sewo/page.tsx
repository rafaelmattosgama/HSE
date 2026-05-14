import { ActionStatus } from "@prisma/client";
import { SewoWorkspace } from "@/components/feature/sewo-workspace";
import { formatCommunicationType } from "@/lib/helpers";
import { prisma } from "@/lib/prisma";
import { translateForViewer } from "@/lib/services/viewer-translation-service";
import { getLocale } from "next-intl/server";

function monthLabel(date: Date, locale = "en-US") {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
}

export default async function SewoPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
  const { plant } = await params;
  const locale = await getLocale();
  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });

  const [sewoRecords, catalogVersions, communications, areas, workstations, shifts, workers, bodyParts, injuryTypes, actionOwners] = await prisma.$transaction([
    prisma.sEWO.findMany({
      where: {
        plantId: plantRow.id,
      },
      include: {
        communication: {
          include: {
            area: true,
            workstation: true,
          },
        },
        performedBy: true,
      },
      orderBy: {
        analysisDate: "desc",
      },
      take: 100,
    }),
    prisma.sEWOCauseCatalogVersion.findMany({
      orderBy: {
        version: "desc",
      },
      take: 1,
    }),
    prisma.communication.findMany({
      where: {
        plantId: plantRow.id,
        type: {
          in: ["UNSAFE_ACT", "UNSAFE_CONDITION", "NEAR_MISS", "FIRST_AID", "ACCIDENT"],
        },
        status: {
          in: ["VALID_OPEN", "ONGOING", "CLOSED"],
        },
      },
      orderBy: {
        eventDatetime: "desc",
      },
      take: 200,
      include: {
        targetEmployee: true,
        area: true,
        workstation: true,
        sewoRecords: {
          select: {
            id: true,
          },
          take: 1,
        },
        actions: {
          where: {
            status: {
              in: [ActionStatus.OPEN, ActionStatus.ONGOING],
            },
          },
          include: {
            ownerUser: true,
          },
          orderBy: {
            dueDate: "asc",
          },
        },
      },
    }),
    prisma.area.findMany({ where: { plantId: plantRow.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.workstation.findMany({ where: { plantId: plantRow.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.shift.findMany({ where: { plantId: plantRow.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.employeeDirectory.findMany({ where: { plantId: plantRow.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.bodyPart.findMany({ where: { plantId: plantRow.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.injuryType.findMany({ where: { plantId: plantRow.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.userPlantRole.findMany({
      where: { plantId: plantRow.id, user: { isActive: true } },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
  ]);
  const translatedSewoDescriptions = await translateForViewer(locale, sewoRecords.map((record) => record.howText));

  const currentCatalog = catalogVersions[0];

  return (
    <SewoWorkspace
      plant={plant}
      causeCatalogVersionId={currentCatalog?.id}
      sewoRows={sewoRecords.map((record, index) => ({
        id: record.id,
        date: record.analysisDate.toISOString().slice(0, 10),
        local: record.communication.workstation?.name ?? record.communication.area?.name ?? record.whereText,
        typeLabel: formatCommunicationType(record.communication.type),
        status: record.status,
        communicationId: record.communicationId,
        performedByName: record.performedBy.name,
        description: translatedSewoDescriptions[index] ?? record.howText,
      }))}
      communications={communications.map((communication) => {
        const monthKey = communication.eventDatetime.toISOString().slice(0, 7);
        return {
          id: communication.id,
          eventDate: communication.eventDatetime.toISOString().slice(0, 10),
          monthKey,
          monthLabel: monthLabel(communication.eventDatetime),
          typeLabel: formatCommunicationType(communication.type),
          locationLabel: communication.workstation?.name ?? communication.area?.name ?? "-",
          type: communication.type,
          areaId: communication.areaId,
          workstationId: communication.workstationId,
          targetEmployeeId: communication.targetEmployeeId,
          targetEmployeeName: communication.targetEmployee?.name ?? communication.targetText,
          shiftId: communication.shiftId,
          injuryTypeId: communication.injuryTypeId,
          bodyPartId: communication.bodyPartId,
          description: communication.description,
          suggestedAction: communication.suggestedAction,
          linkedSewoId: communication.sewoRecords[0]?.id ?? null,
          openActions: communication.actions.map((action) => ({
            id: action.id,
            title: action.title,
            description: action.description,
            ownerUserId: action.ownerUserId,
            ownerName: action.ownerUser.name,
            priority: action.priority,
            category: action.category,
            dueDate: action.dueDate.toISOString().slice(0, 10),
            status: action.status,
          })),
        };
      })}
      areas={areas.map((area) => ({ id: area.id, name: area.name }))}
      workstations={workstations.map((workstation) => ({ id: workstation.id, name: workstation.name }))}
      shifts={shifts.map((shift) => ({ id: shift.id, name: shift.name }))}
      workers={workers.map((worker) => ({ id: worker.id, employeeNo: worker.employeeNo, name: worker.name, dept: worker.dept }))}
      bodyParts={bodyParts.map((bodyPart) => ({ id: bodyPart.id, name: bodyPart.name }))}
      injuryTypes={injuryTypes.map((injuryType) => ({ id: injuryType.id, name: injuryType.name }))}
      actionOwners={actionOwners.map((entry) => ({ id: entry.user.id, name: entry.user.name }))}
    />
  );
}
