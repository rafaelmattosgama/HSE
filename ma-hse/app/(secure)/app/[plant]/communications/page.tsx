import { RoleCode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { CreateCommunicationQuick } from "@/components/feature/create-communication-quick";
import { CommunicationsTable } from "@/components/feature/communications-table";
import { authOptions } from "@/lib/auth/options";
import { canManageCommunicationClassification } from "@/lib/communication-classification";
import { DEFAULT_NEAR_MISS_TYPE_CODES } from "@/lib/defaults/near-miss-types";
import { prisma } from "@/lib/prisma";
import { isAllPlantsScope } from "@/lib/plant-scope";
import { localizeBodyPartRows, localizeInjuryTypeRows } from "@/lib/public-report";
import { getServerUiLocale } from "@/lib/server-ui-language";
import {
  localizeCommunicationCatalogRows,
  localizeCommunicationCategorizedCatalogRows,
} from "@/lib/services/communication-catalog-localization";
import { getLocalizedCommunicationUi } from "@/lib/services/communication-ui-localization";
import { ensureDefaultProfessionalRisks } from "@/lib/services/professional-risk-service";
import { ensureDefaultNearMissTypes } from "@/lib/services/near-miss-type-service";
import { ensureDefaultUnsafeActTypes } from "@/lib/services/unsafe-act-type-service";
import { ensureDefaultUnsafeConditionTypes } from "@/lib/services/unsafe-condition-type-service";
import { getUiDictionary } from "@/lib/ui-language";

const LINKED_ACTION_ROLES: RoleCode[] = [
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
];
const DELETE_COMMUNICATION_ROLES: RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N3_SAFETY,
];

export default async function CommunicationsPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
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
    redirect(`/app/${plantRows[0]?.code ?? scopedPlantCodes[0]}/communications`);
  }
  await Promise.all(
    plantRows.flatMap((plantRow) => [
      ensureDefaultProfessionalRisks(plantRow.id),
      ensureDefaultNearMissTypes(plantRow.id),
      ensureDefaultUnsafeActTypes(plantRow.id),
      ensureDefaultUnsafeConditionTypes(plantRow.id),
    ]),
  );
  const uiLocale = await getServerUiLocale({
    userLanguage: session.user.language,
    plantLanguage: isAllPlants ? undefined : plantRows[0]?.defaultLanguage,
  });
  const ui = getUiDictionary(uiLocale);
  const userLanguage = uiLocale;
  const actorRole = session?.user.plantRoles.some((entry) => entry.role === RoleCode.N0_ADMIN)
    ? RoleCode.N0_ADMIN
    : session?.user.plantRoles.some((entry) => entry.role === RoleCode.N1_CORPORATE)
      ? RoleCode.N1_CORPORATE
      : isAllPlants
        ? session.user.plantRoles.find((entry) => entry.plantCode)?.role ?? null
        : session.user.plantRoles.find((entry) => entry.plantCode === plant)?.role ?? null;
  const canDeleteCommunications = Boolean(
    actorRole && DELETE_COMMUNICATION_ROLES.includes(actorRole),
  );
  const canManageClassification = canManageCommunicationClassification(actorRole);

  const [communications, areas, workstations, plantUsers, employees, bodyParts, injuryTypes, riskThemes, unsafeActTypes, unsafeConditionTypes, nearMissTypes] = await prisma.$transaction([
    prisma.communication.findMany({
      where: {
        plantId: { in: plantRows.map((row) => row.id) },
        status: {
          in: ["VALID_OPEN", "ONGOING", "CLOSED"],
        },
      },
      include: {
        plant: true,
        area: true,
        workstation: true,
        targetEmployee: true,
        involvedEmployees: {
          include: { employee: true },
          orderBy: { sortOrder: "asc" },
        },
        unsafeActType: true,
        unsafeConditionType: true,
        nearMissType: true,
      },
      orderBy: { eventDatetime: "desc" },
      take: 200,
    }),
    prisma.area.findMany({
      where: { plantId: { in: plantRows.map((row) => row.id) }, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.workstation.findMany({
      where: { plantId: { in: plantRows.map((row) => row.id) }, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.userPlantRole.findMany({
      where: { plantId: { in: plantRows.map((row) => row.id) }, user: { isActive: true } },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.employeeDirectory.findMany({
      where: { plantId: { in: plantRows.map((row) => row.id) }, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.bodyPart.findMany({
      where: { plantId: { in: plantRows.map((row) => row.id) }, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.injuryType.findMany({
      where: { plantId: { in: plantRows.map((row) => row.id) }, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.riskTheme.findMany({
      where: { plantId: { in: plantRows.map((row) => row.id) }, isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }],
    }),
    prisma.unsafeActType.findMany({
      where: { plantId: { in: plantRows.map((row) => row.id) }, isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }],
    }),
    prisma.unsafeConditionType.findMany({
      where: { plantId: { in: plantRows.map((row) => row.id) }, isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }],
    }),
    prisma.nearMissType.findMany({
      where: { plantId: { in: plantRows.map((row) => row.id) }, isActive: true, code: { in: DEFAULT_NEAR_MISS_TYPE_CODES } },
      orderBy: { code: "asc" },
    }),
  ]);
  const [
    localizedAreas,
    localizedInjuryTypes,
    localizedRiskThemes,
    localizedUnsafeActTypes,
    localizedUnsafeConditionTypes,
    localizedNearMissTypes,
    localizedBodyParts,
    communicationUi,
  ] = await Promise.all([
    localizeCommunicationCatalogRows(areas, userLanguage),
    Promise.resolve(localizeInjuryTypeRows(injuryTypes, userLanguage)),
    localizeCommunicationCategorizedCatalogRows(riskThemes, userLanguage),
    localizeCommunicationCategorizedCatalogRows(unsafeActTypes, userLanguage),
    localizeCommunicationCategorizedCatalogRows(unsafeConditionTypes, userLanguage),
    localizeCommunicationCatalogRows(nearMissTypes, userLanguage),
    Promise.resolve(localizeBodyPartRows(bodyParts, userLanguage)),
    getLocalizedCommunicationUi(uiLocale),
  ]);
  const localizedAreaById = new Map(localizedAreas.map((area) => [area.id, area.name]));
  const localizedUnsafeActTypeById = new Map(localizedUnsafeActTypes.map((type) => [type.id, type.name]));
  const localizedUnsafeConditionTypeById = new Map(localizedUnsafeConditionTypes.map((type) => [type.id, type.name]));
  const localizedNearMissTypeById = new Map(localizedNearMissTypes.map((type) => [type.id, type.name]));
  const employeeByPlantAndNumber = new Map(employees.map((employee) => [`${employee.plantId}:${employee.employeeNo}`, employee]));
  const formatEmployee = (employee?: { employeeNo: string; name: string } | null) =>
    employee ? `${employee.employeeNo} - ${employee.name}` : null;

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{ui.modules.communications}</h1>
      </header>

      {!isAllPlants ? (
        <CreateCommunicationQuick
          areas={localizedAreas.map((area) => ({ id: area.id, name: area.name }))}
          workstations={workstations.map((workstation) => ({ id: workstation.id, name: workstation.name }))}
          actionOwners={plantUsers.map((entry) => ({ id: entry.user.id, name: entry.user.name }))}
          employees={employees.map((employee) => ({ id: employee.id, name: employee.name, employeeNo: employee.employeeNo }))}
          bodyParts={localizedBodyParts.map((bodyPart) => ({ id: bodyPart.id, code: bodyPart.code ?? undefined, name: bodyPart.name }))}
          injuryTypes={localizedInjuryTypes.map((injuryType) => ({ id: injuryType.id, code: injuryType.code ?? undefined, name: injuryType.name }))}
          riskThemes={localizedRiskThemes.map((risk) => ({ id: risk.id, code: risk.code, category: risk.category, name: risk.name }))}
          unsafeActTypes={localizedUnsafeActTypes.map((type) => ({ id: type.id, code: type.code, category: type.category, name: type.name }))}
          unsafeConditionTypes={(canManageClassification ? localizedUnsafeConditionTypes : []).map((type) => ({ id: type.id, code: type.code, category: type.category, name: type.name }))}
          nearMissTypes={(canManageClassification ? localizedNearMissTypes : []).map((type) => ({ id: type.id, code: type.code, name: type.name }))}
          canLinkAction={actorRole ? LINKED_ACTION_ROLES.includes(actorRole) : false}
          canManageClassification={canManageClassification}
          labels={communicationUi.createCommunicationQuick}
          typeLabels={communicationUi.communicationTypeLabels}
        />
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          Para criar comunicacoes, selecione uma planta especifica no seletor.
        </div>
      )}

      <CommunicationsTable
        plant={plant}
        canDelete={canDeleteCommunications}
        canViewClassification={canManageClassification}
        labels={communicationUi.communicationsTable}
        typeLabels={communicationUi.communicationTypeLabels}
        statusLabels={communicationUi.communicationStatusLabels}
        showPlant={isAllPlants}
        rows={communications.map((row) => {
          const reporterEmployee = employeeByPlantAndNumber.get(`${row.plantId}:${row.reporterEmployeeNo ?? ""}`);
          const involvedWorkers = row.involvedEmployees
            .map((entry) => formatEmployee(entry.employee))
            .filter((value): value is string => Boolean(value));
          const fallbackInvolvedWorker =
            formatEmployee(row.targetEmployee)
            ?? [row.targetEmployeeNo, row.targetText].filter(Boolean).join(" - ");
          return {
            id: row.id,
            plantCode: row.plant.code,
            plantName: row.plant.name,
            codigoCompleto: row.codigoCompleto,
            codigoAbreviado: row.codigoAbreviado,
            eventDatetime: row.eventDatetime.toISOString(),
            level: row.level,
            type: row.type,
            status: row.status,
            reporterName: reporterEmployee ? `${reporterEmployee.employeeNo} - ${reporterEmployee.name}` : row.reporterName,
            department: (row.areaId ? localizedAreaById.get(row.areaId) : null) ?? row.area?.name ?? "-",
            location: row.workstation?.name ?? "-",
            involvedWorker: involvedWorkers.length > 0 ? involvedWorkers.join(", ") : fallbackInvolvedWorker || "-",
            description: row.description,
            unsafeActType:
              canManageClassification
                ? (row.unsafeActTypeId ? localizedUnsafeActTypeById.get(row.unsafeActTypeId) : null) ?? row.unsafeActType?.name ?? "-"
                : undefined,
            unsafeConditionType:
              canManageClassification
                ? (row.unsafeConditionTypeId ? localizedUnsafeConditionTypeById.get(row.unsafeConditionTypeId) : null) ?? row.unsafeConditionType?.name ?? "-"
                : undefined,
            nearMissType:
              canManageClassification
                ? (row.nearMissTypeId ? localizedNearMissTypeById.get(row.nearMissTypeId) : null) ?? row.nearMissType?.name ?? "-"
                : undefined,
          };
        })}
      />
    </>
  );
}
