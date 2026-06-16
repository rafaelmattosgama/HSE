import { ActionStatus } from "@prisma/client";
import { SewoWorkspace } from "@/components/feature/sewo-workspace";
import { prisma } from "@/lib/prisma";
import { localizeBodyPartRows, localizeInjuryTypeRows } from "@/lib/public-report";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { getLocalizedSewoUi } from "@/lib/services/sewo-ui-localization";
import { ensureDefaultShifts } from "@/lib/services/shift-service";
import { translateForViewer } from "@/lib/services/viewer-translation-service";
import { formatLocalizedCommunicationType, formatLocalizedSewoStatus } from "@/lib/sewo-ui";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";

function monthLabel(date: Date, locale = "en-US") {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getRecordString(value: Record<string, unknown>, key: string) {
  const entry = value[key];
  return typeof entry === "string" && entry.trim() ? entry : null;
}

export default async function SewoPage({
  params,
  searchParams,
}: {
  params: Promise<{ plant: string }>;
  searchParams: Promise<{ mode?: string; sewoId?: string }>;
}) {
  const { plant } = await params;
  const currentSearchParams = await searchParams;
  const session = await getServerSession(authOptions);
  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });
  const uiLocale = await getServerUiLocale({
    userLanguage: session?.user.language,
    plantLanguage: plantRow.defaultLanguage,
  });
  await ensureDefaultShifts(plantRow.id);

  const [sewoRecords, catalogVersions, communications, areas, workstations, shifts, workers, bodyParts, injuryTypes, actionOwners] = await prisma.$transaction([
    prisma.sEWO.findMany({
      where: {
        plantId: plantRow.id,
      },
      include: {
        communication: {
          include: {
            area: true,
            line: true,
            shift: true,
            workstation: true,
            targetEmployee: true,
            bodyPart: true,
            injuryType: true,
            actions: {
              include: {
                ownerUser: true,
              },
              orderBy: {
                dueDate: "asc",
              },
            },
          },
        },
        approvedBy: true,
        performedBy: true,
        actions: {
          include: {
            ownerUser: true,
          },
          orderBy: {
            dueDate: "asc",
          },
        },
        actionLinks: {
          include: {
            action: {
              include: {
                ownerUser: true,
              },
            },
          },
        },
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
            codigoSewo: true,
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
    prisma.shift.findMany({ where: { plantId: plantRow.id, isActive: true }, orderBy: { code: "asc" } }),
    prisma.employeeDirectory.findMany({ where: { plantId: plantRow.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.bodyPart.findMany({ where: { plantId: plantRow.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.injuryType.findMany({ where: { plantId: plantRow.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.userPlantRole.findMany({
      where: { plantId: plantRow.id, user: { isActive: true } },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
  ]);
  const localizedBodyParts = localizeBodyPartRows(bodyParts, uiLocale);
  const localizedInjuryTypes = localizeInjuryTypeRows(injuryTypes, uiLocale);
  const [{ ui, rootCauseGroups }, translatedSewoDescriptions, translatedStandaloneTypes] = await Promise.all([
    getLocalizedSewoUi(uiLocale),
    translateForViewer(uiLocale, sewoRecords.map((record) => record.howText)),
    translateForViewer(
      uiLocale,
      sewoRecords.map((record) => (record.communication ? "" : record.eventClassification)),
    ),
  ]);

  const currentCatalog = catalogVersions[0];

  return (
    <SewoWorkspace
      key={`${plant}:${currentSearchParams.mode ?? "list"}:${currentSearchParams.sewoId ?? ""}`}
      plant={plant}
      initialSelectedSewoId={currentSearchParams.sewoId ?? null}
      mode={currentSearchParams.mode === "create" ? "create" : "list"}
      causeCatalogVersionId={currentCatalog?.id}
      sewoRows={sewoRecords.map((record, index) => {
        const linkedActions = new Map(
          [
            ...record.actions.map((action) => [action.id, action] as const),
            ...record.actionLinks.map((entry) => [entry.action.id, entry.action] as const),
          ],
        );
        const templateData = asRecord(record.templateData);
        const communication = record.communication;
        const formTemplateData = {
          ...templateData,
          sourceCommunicationId: getRecordString(templateData, "sourceCommunicationId") ?? communication?.id ?? null,
          eventType: getRecordString(templateData, "eventType") ?? communication?.type ?? null,
          eventDatetime: getRecordString(templateData, "eventDatetime") ?? communication?.eventDatetime.toISOString() ?? null,
          reporterName: getRecordString(templateData, "reporterName") ?? communication?.reporterName ?? null,
          reporterEmployeeNo: getRecordString(templateData, "reporterEmployeeNo") ?? communication?.reporterEmployeeNo ?? null,
          areaId: getRecordString(templateData, "areaId") ?? communication?.areaId ?? null,
          lineId: getRecordString(templateData, "lineId") ?? communication?.lineId ?? null,
          workstationId: getRecordString(templateData, "workstationId") ?? communication?.workstationId ?? null,
          shiftId: getRecordString(templateData, "shiftId") ?? communication?.shiftId ?? null,
          involvedWorkerId: getRecordString(templateData, "involvedWorkerId") ?? communication?.targetEmployeeId ?? null,
          involvedWorkerName: getRecordString(templateData, "involvedWorkerName") ?? communication?.targetEmployee?.name ?? communication?.targetText ?? "",
          involvedWorkerEmployeeNo: getRecordString(templateData, "involvedWorkerEmployeeNo") ?? communication?.targetEmployee?.employeeNo ?? communication?.targetEmployeeNo ?? null,
          involvedWorkerDepartment: getRecordString(templateData, "involvedWorkerDepartment") ?? communication?.targetEmployee?.dept ?? null,
          natureId: getRecordString(templateData, "natureId") ?? communication?.injuryTypeId ?? null,
          bodyPartId: getRecordString(templateData, "bodyPartId") ?? communication?.bodyPartId ?? null,
          whereText: getRecordString(templateData, "whereText") ?? (record.whereText || communication?.workstation?.name || communication?.area?.name || ""),
          analysisText: getRecordString(templateData, "analysisText") ?? (record.howText || communication?.description || ""),
          suggestedAction: getRecordString(templateData, "suggestedAction") ?? communication?.suggestedAction ?? "",
        };

        return {
          id: record.id,
          codigoSewo: record.codigoSewo,
          date: record.analysisDate.toISOString().slice(0, 10),
          local: record.whereText || record.communication?.workstation?.name || record.communication?.area?.name || "",
          typeLabel: record.communication
            ? formatLocalizedCommunicationType(record.communication.type, ui)
            : translatedStandaloneTypes[index] ?? record.eventClassification,
          status: record.status,
          statusLabel: formatLocalizedSewoStatus(record.status, ui),
          communicationId: record.communicationId ?? null,
          performedByName: record.performedBy.name,
          description: translatedSewoDescriptions[index] ?? record.howText,
          formData: {
            id: record.id,
            codigoSewo: record.codigoSewo,
            communicationId: record.communicationId ?? null,
            eventClassification: record.eventClassification,
            areaId: record.areaId ?? communication?.areaId ?? null,
            workstationId: getRecordString(formTemplateData, "workstationId"),
            shiftId: record.shiftId ?? communication?.shiftId ?? null,
            analysisDate: record.analysisDate.toISOString(),
            whatText: record.whatText,
            whereText: record.whereText,
            whoText: record.whoText,
            usualWorkYesNo: record.usualWorkYesNo,
            whichText: record.whichText,
            howText: record.howText,
            immediateCorrectiveActionText: record.immediateCorrectiveActionText,
            templateData: formTemplateData,
            causeCatalogVersionId: record.causeCatalogVersionId,
            status: record.status,
            approvalComment: record.approvalComment,
            approvedAt: record.approvedAt?.toISOString() ?? null,
            approvedByName: record.approvedBy?.name ?? null,
            linkedActions: Array.from(
              new Map(
                [
                  ...linkedActions.values(),
                  ...(communication?.actions ?? []),
                ].map((action) => [action.id, action] as const),
              ).values(),
            ).map((action) => ({
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
          },
        };
      })}
      communications={communications.map((communication) => {
        const monthKey = communication.eventDatetime.toISOString().slice(0, 7);
        return {
          id: communication.id,
          codigoCompleto: communication.codigoCompleto,
          codigoAbreviado: communication.codigoAbreviado,
          eventDate: communication.eventDatetime.toISOString().slice(0, 10),
          monthKey,
          monthLabel: monthLabel(communication.eventDatetime, uiLocale),
          typeLabel: formatLocalizedCommunicationType(communication.type, ui),
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
          linkedSewoCode: communication.sewoRecords[0]?.codigoSewo ?? null,
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
      bodyParts={localizedBodyParts.map((bodyPart) => ({ id: bodyPart.id, code: bodyPart.code ?? undefined, name: bodyPart.name }))}
      injuryTypes={localizedInjuryTypes.map((injuryType) => ({ id: injuryType.id, code: injuryType.code ?? undefined, name: injuryType.name }))}
      actionOwners={actionOwners.map((entry) => ({ id: entry.user.id, name: entry.user.name }))}
      ui={ui}
      rootCauseGroups={rootCauseGroups}
    />
  );
}
