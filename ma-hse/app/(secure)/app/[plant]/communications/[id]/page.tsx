import Link from "next/link";
import { CommunicationStatus, RoleCode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { CommunicationDetailEditor } from "@/components/feature/communication-detail-editor";
import { formatCommunicationType } from "@/lib/helpers";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { translateForViewer } from "@/lib/services/viewer-translation-service";
import { getLocale } from "next-intl/server";

const EDIT_ROLES: RoleCode[] = [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY];
const VALID_COMMUNICATION_STATUSES: CommunicationStatus[] = [
  CommunicationStatus.SUBMITTED,
  CommunicationStatus.PENDING_VALIDATION,
  CommunicationStatus.VALID_OPEN,
  CommunicationStatus.ONGOING,
  CommunicationStatus.CLOSED,
];

export default async function CommunicationDetailPage({
  params,
}: {
  params: Promise<{ plant: string; id: string }>;
}) {
  const { plant, id } = await params;
  const locale = await getLocale();
  const session = await getServerSession(authOptions);
  const plantRow = await prisma.plant.findUnique({ where: { code: plant } });
  if (!plantRow) notFound();

  const actorRole =
    session?.user.plantRoles.find((entry) => entry.plantCode === plant)?.role ??
    (session?.user.plantRoles.some((entry) => entry.role === RoleCode.N1_CORPORATE) ? RoleCode.N1_CORPORATE : null);

  const [
    communication,
    areas,
    workstations,
    equipments,
    riskThemes,
    unsafeActTypes,
    unsafeConditionTypes,
    nearMissTypes,
    employees,
    bodyParts,
    injuryTypes,
    plantUsers,
  ] = await prisma.$transaction([
    prisma.communication.findFirst({
      where: {
        id,
        plantId: plantRow.id,
      },
      include: {
        actions: {
          include: {
            ownerUser: true,
          },
        },
        attachments: true,
        sewoRecords: true,
        riskTheme: true,
        area: true,
        line: true,
        workstation: true,
        equipment: true,
        bodyPart: true,
        injuryType: true,
      },
    }),
    prisma.area.findMany({ where: { plantId: plantRow.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.workstation.findMany({ where: { plantId: plantRow.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.equipment.findMany({ where: { plantId: plantRow.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.riskTheme.findMany({ where: { plantId: plantRow.id, isActive: true }, orderBy: [{ code: "asc" }, { name: "asc" }] }),
    prisma.unsafeActType.findMany({ where: { plantId: plantRow.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.unsafeConditionType.findMany({ where: { plantId: plantRow.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.nearMissType.findMany({ where: { plantId: plantRow.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.employeeDirectory.findMany({ where: { plantId: plantRow.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.bodyPart.findMany({ where: { plantId: plantRow.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.injuryType.findMany({ where: { plantId: plantRow.id, isActive: true }, orderBy: { name: "asc" } }),
    prisma.userPlantRole.findMany({
      where: { plantId: plantRow.id, user: { isActive: true } },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  if (!communication) notFound();
  const translatedActionTitles = await translateForViewer(locale, communication.actions.map((action) => action.title));

  const canEdit = Boolean(actorRole && EDIT_ROLES.includes(actorRole) && VALID_COMMUNICATION_STATUSES.includes(communication.status));

  return (
    <div className="space-y-5">
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{formatCommunicationType(communication.type)}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Communication {communication.id} for plant {plant.toUpperCase()}.
        </p>
      </header>

      <CommunicationDetailEditor
        communication={{
          id: communication.id,
          type: communication.type,
          status: communication.status,
          eventDatetime: communication.eventDatetime.toISOString(),
          reporterName: communication.reporterName,
          reporterEmployeeNo: communication.reporterEmployeeNo,
          targetText: communication.targetText,
          targetEmployeeNo: communication.targetEmployeeNo,
          targetEmployeeId: communication.targetEmployeeId,
          areaId: communication.areaId,
          workstationId: communication.workstationId,
          equipmentId: communication.equipmentId,
          riskThemeId: communication.riskThemeId,
          unsafeActTypeId: communication.unsafeActTypeId,
          unsafeConditionTypeId: communication.unsafeConditionTypeId,
          nearMissTypeId: communication.nearMissTypeId,
          description: communication.description,
          suggestedAction: communication.suggestedAction,
          severityPotential: communication.severityPotential,
          isContractor: communication.isContractor,
          bodyPartId: communication.bodyPartId,
          injuryTypeId: communication.injuryTypeId,
          isFatal: communication.isFatal,
          initialLostDays: communication.initialLostDays,
          hasLeave: communication.hasLeave,
          returnDate: communication.returnDate?.toISOString() ?? null,
        }}
        canEdit={canEdit}
        areas={areas.map((entry) => ({ id: entry.id, name: entry.name }))}
        workstations={workstations.map((entry) => ({ id: entry.id, name: entry.name }))}
        equipments={equipments.map((entry) => ({ id: entry.id, name: entry.name }))}
        riskThemes={riskThemes.map((entry) => ({ id: entry.id, name: entry.name, code: entry.code }))}
        unsafeActTypes={unsafeActTypes.map((entry) => ({ id: entry.id, name: entry.name }))}
        unsafeConditionTypes={unsafeConditionTypes.map((entry) => ({ id: entry.id, name: entry.name }))}
        nearMissTypes={nearMissTypes.map((entry) => ({ id: entry.id, name: entry.name }))}
        employees={employees.map((entry) => ({ id: entry.id, name: entry.name, employeeNo: entry.employeeNo }))}
        bodyParts={bodyParts.map((entry) => ({ id: entry.id, name: entry.name }))}
        injuryTypes={injuryTypes.map((entry) => ({ id: entry.id, name: entry.name }))}
        actionOwners={plantUsers.map((entry) => ({ id: entry.userId, label: entry.user.name }))}
      />

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Attachments</h2>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            {communication.attachments.length ? communication.attachments.map((attachment) => (
              <p key={attachment.id}>{attachment.fileName}</p>
            )) : <p>No attachments.</p>}
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Linked records</h2>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <p>Actions: {communication.actions.length}</p>
            <p>S-EWO records: {communication.sewoRecords.length}</p>
            {communication.actions.slice(0, 5).map((action, index) => (
              <p key={action.id}>
                {translatedActionTitles[index] ?? action.title} ({action.status})
              </p>
            ))}
          </div>
        </article>
      </section>

      <Link href={`/app/${plant}/communications`} className="inline-block text-sm font-semibold text-teal-700 hover:underline">
        Back to communications
      </Link>
    </div>
  );
}
