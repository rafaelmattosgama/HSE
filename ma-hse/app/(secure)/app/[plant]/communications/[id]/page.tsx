import Link from "next/link";
import { CommunicationStatus, RoleCode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { CommunicationDetailEditor } from "@/components/feature/communication-detail-editor";
import { ValidationActions } from "@/components/feature/validation-actions";
import { authOptions } from "@/lib/auth/options";
import { canManageCommunicationClassification } from "@/lib/communication-classification";
import { DEFAULT_NEAR_MISS_TYPE_CODES } from "@/lib/defaults/near-miss-types";
import { prisma } from "@/lib/prisma";
import { localizeBodyPartRows, localizeInjuryTypeRows } from "@/lib/public-report";
import { getServerUiLocale } from "@/lib/server-ui-language";
import {
  localizeCommunicationCatalogRows,
  localizeCommunicationCategorizedCatalogRows,
} from "@/lib/services/communication-catalog-localization";
import { getLocalizedCommunicationUi } from "@/lib/services/communication-ui-localization";
import { ensureDefaultNearMissTypes } from "@/lib/services/near-miss-type-service";
import { ensureDefaultProfessionalRisks } from "@/lib/services/professional-risk-service";
import { getLocalizedSewoUi } from "@/lib/services/sewo-ui-localization";
import { ensureDefaultUnsafeActTypes } from "@/lib/services/unsafe-act-type-service";
import { ensureDefaultUnsafeConditionTypes } from "@/lib/services/unsafe-condition-type-service";
import { translateForViewer } from "@/lib/services/viewer-translation-service";

const EDIT_ROLES: RoleCode[] = [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY];
const VALID_COMMUNICATION_STATUSES: CommunicationStatus[] = [
  CommunicationStatus.SUBMITTED,
  CommunicationStatus.PENDING_VALIDATION,
  CommunicationStatus.VALID_OPEN,
  CommunicationStatus.ONGOING,
  CommunicationStatus.CLOSED,
];

export default async function CommunicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ plant: string; id: string }>;
  searchParams?: Promise<{ from?: string }>;
}) {
  const { plant, id } = await params;
  const currentSearchParams = (await searchParams) ?? {};
  const session = await getServerSession(authOptions);
  const plantRow = await prisma.plant.findUnique({ where: { code: plant } });
  if (!plantRow) notFound();
  await ensureDefaultProfessionalRisks(plantRow.id);
  await ensureDefaultNearMissTypes(plantRow.id);
  await ensureDefaultUnsafeActTypes(plantRow.id);
  await ensureDefaultUnsafeConditionTypes(plantRow.id);
  const uiLocale = await getServerUiLocale({
    userLanguage: session?.user.language,
    plantLanguage: plantRow.defaultLanguage,
  });

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
    prisma.riskTheme.findMany({
      where: {
        plantId: plantRow.id,
        OR: [
          { isActive: true },
          {
            communications: {
              some: {
                id,
              },
            },
          },
        ],
      },
      orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }],
    }),
    prisma.unsafeActType.findMany({
      where: {
        plantId: plantRow.id,
        OR: [
          { isActive: true },
          {
            communications: {
              some: {
                id,
              },
            },
          },
        ],
      },
      orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }],
    }),
    prisma.unsafeConditionType.findMany({
      where: {
        plantId: plantRow.id,
        OR: [
          { isActive: true },
          {
            communications: {
              some: {
                id,
              },
            },
          },
        ],
      },
      orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }],
    }),
    prisma.nearMissType.findMany({
      where: { plantId: plantRow.id, isActive: true, code: { in: DEFAULT_NEAR_MISS_TYPE_CODES } },
      orderBy: { code: "asc" },
    }),
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
  const [
    localizedAreas,
    localizedRiskThemes,
    localizedUnsafeActTypes,
    localizedUnsafeConditionTypes,
    localizedNearMissTypes,
    localizedBodyParts,
    localizedInjuryTypes,
    translatedActionTitles,
    communicationUi,
    { ui: sewoUi },
  ] = await Promise.all([
    localizeCommunicationCatalogRows(areas, uiLocale),
    localizeCommunicationCategorizedCatalogRows(riskThemes, uiLocale),
    localizeCommunicationCategorizedCatalogRows(unsafeActTypes, uiLocale),
    localizeCommunicationCategorizedCatalogRows(unsafeConditionTypes, uiLocale),
    localizeCommunicationCatalogRows(nearMissTypes, uiLocale),
    Promise.resolve(localizeBodyPartRows(bodyParts, uiLocale)),
    Promise.resolve(localizeInjuryTypeRows(injuryTypes, uiLocale)),
    translateForViewer(uiLocale, communication.actions.map((action) => action.title)),
    getLocalizedCommunicationUi(uiLocale),
    getLocalizedSewoUi(uiLocale),
  ]);

  const canEdit = Boolean(actorRole && EDIT_ROLES.includes(actorRole) && VALID_COMMUNICATION_STATUSES.includes(communication.status));
  const manageableStatuses: CommunicationStatus[] = [
    CommunicationStatus.VALID_OPEN,
    CommunicationStatus.ONGOING,
    CommunicationStatus.CLOSED,
  ];
  const canManageStatus = Boolean(
    actorRole &&
    EDIT_ROLES.includes(actorRole) &&
    manageableStatuses.includes(communication.status),
  );
  const canManageClassification = canManageCommunicationClassification(actorRole);
  const canValidate = Boolean(
    actorRole &&
    (actorRole === RoleCode.N1_CORPORATE || actorRole === RoleCode.N2_PLANT_MANAGER || actorRole === RoleCode.N3_SAFETY) &&
    (communication.status === CommunicationStatus.SUBMITTED || communication.status === CommunicationStatus.PENDING_VALIDATION),
  );
  const typeLabel = communicationUi.communicationTypeLabels[communication.type] ?? communication.type;
  const statusLabel = communicationUi.communicationStatusLabels[communication.status] ?? communication.status;
  const backHref = currentSearchParams.from === "validation" ? `/app/${plant}/validation` : `/app/${plant}/communications`;
  const backLabel =
    currentSearchParams.from === "validation"
      ? communicationUi.detailPage.backToValidation
      : communicationUi.detailPage.backToCommunications;

  return (
    <div className="space-y-5">
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{typeLabel}</h1>
      </header>

      <CommunicationDetailEditor
        plant={plant}
        communication={{
          id: communication.id,
          type: communication.type,
          level: communication.level,
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
          riskThemeId: canManageClassification || (communication.type !== "NEAR_MISS" && communication.type !== "FIRST_AID") ? communication.riskThemeId : null,
          unsafeActTypeId: canManageClassification || communication.type !== "FIRST_AID" ? communication.unsafeActTypeId : null,
          unsafeConditionTypeId: canManageClassification ? communication.unsafeConditionTypeId : null,
          nearMissTypeId: canManageClassification ? communication.nearMissTypeId : null,
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
          linkedActionStatuses: communication.actions.map((entry) => entry.status),
        }}
        canEdit={canEdit}
        canManageStatus={canManageStatus}
        canManageClassification={canManageClassification}
        areas={localizedAreas.map((entry) => ({ id: entry.id, name: entry.name }))}
        workstations={workstations.map((entry) => ({ id: entry.id, name: entry.name }))}
        equipments={equipments.map((entry) => ({ id: entry.id, name: entry.name }))}
        riskThemes={(canManageClassification || communication.type === "ACCIDENT" ? localizedRiskThemes : []).map((entry) => ({ id: entry.id, name: entry.name, code: entry.code, category: entry.category }))}
        unsafeActTypes={localizedUnsafeActTypes.map((entry) => ({ id: entry.id, code: entry.code, category: entry.category, name: entry.name }))}
        unsafeConditionTypes={(canManageClassification ? localizedUnsafeConditionTypes : []).map((entry) => ({ id: entry.id, code: entry.code, category: entry.category, name: entry.name }))}
        nearMissTypes={(canManageClassification ? localizedNearMissTypes : []).map((entry) => ({ id: entry.id, code: entry.code, name: entry.name }))}
        employees={employees.map((entry) => ({ id: entry.id, name: entry.name, employeeNo: entry.employeeNo }))}
        bodyParts={localizedBodyParts.map((entry) => ({ id: entry.id, code: entry.code ?? undefined, name: entry.name }))}
        injuryTypes={localizedInjuryTypes.map((entry) => ({ id: entry.id, code: entry.code ?? undefined, name: entry.name }))}
        actionOwners={plantUsers.map((entry) => ({ id: entry.userId, label: entry.user.name }))}
        typeLabels={communicationUi.communicationTypeLabels}
        statusLabel={statusLabel}
        labels={communicationUi.detailEditor}
        createActionLabels={communicationUi.createActionQuick}
        bodyZonePickerLabels={sewoUi.bodyZonePicker}
      />

      {canValidate ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{communicationUi.validationActions.title}</h2>
          <div className="mt-3">
            <ValidationActions plant={plant} communicationId={communication.id} labels={communicationUi.validationActions} onRejectedHref={backHref} />
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{communicationUi.detailPage.attachments}</h2>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            {communication.attachments.length ? communication.attachments.map((attachment) => (
              <p key={attachment.id}>{attachment.fileName}</p>
            )) : <p>{communicationUi.detailPage.noAttachments}</p>}
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{communicationUi.detailPage.linkedRecords}</h2>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <p>{communicationUi.detailPage.actions}: {communication.actions.length}</p>
            <p>{communicationUi.detailPage.sewoRecords}: {communication.sewoRecords.length}</p>
            {communication.actions.slice(0, 5).map((action, index) => (
              <p key={action.id}>
                {translatedActionTitles[index] ?? action.title} ({communicationUi.actionStatusLabels[action.status] ?? action.status})
              </p>
            ))}
          </div>
        </article>
      </section>

      <Link href={backHref} className="inline-block text-sm font-semibold text-teal-700 hover:underline">
        {backLabel}
      </Link>
    </div>
  );
}
