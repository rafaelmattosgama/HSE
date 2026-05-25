import { RoleCode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { CreateCommunicationQuick } from "@/components/feature/create-communication-quick";
import { CommunicationsTable } from "@/components/feature/communications-table";
import { authOptions } from "@/lib/auth/options";
import { canManageCommunicationClassification } from "@/lib/communication-classification";
import { DEFAULT_NEAR_MISS_TYPE_CODES } from "@/lib/defaults/near-miss-types";
import { prisma } from "@/lib/prisma";
import { localizeBodyPartRows, localizeInjuryTypeRows } from "@/lib/public-report";
import { getServerUiLocale } from "@/lib/server-ui-language";
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
  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });
  await ensureDefaultProfessionalRisks(plantRow.id);
  await ensureDefaultNearMissTypes(plantRow.id);
  await ensureDefaultUnsafeActTypes(plantRow.id);
  await ensureDefaultUnsafeConditionTypes(plantRow.id);
  const uiLocale = await getServerUiLocale({
    userLanguage: session?.user.language,
    plantLanguage: plantRow.defaultLanguage,
  });
  const ui = getUiDictionary(uiLocale);
  const userLanguage = uiLocale;
  const actorRole = session?.user.plantRoles.some((entry) => entry.role === RoleCode.N0_ADMIN)
    ? RoleCode.N0_ADMIN
    : session?.user.plantRoles.some((entry) => entry.role === RoleCode.N1_CORPORATE)
      ? RoleCode.N1_CORPORATE
      : session?.user.plantRoles.find((entry) => entry.plantCode === plant)?.role ?? null;
  const canDeleteCommunications = Boolean(
    actorRole && DELETE_COMMUNICATION_ROLES.includes(actorRole),
  );
  const canManageClassification = canManageCommunicationClassification(actorRole);

  const [communications, areas, workstations, plantUsers, employees, bodyParts, injuryTypes, riskThemes, unsafeActTypes, unsafeConditionTypes, nearMissTypes] = await prisma.$transaction([
    prisma.communication.findMany({
      where: {
        plantId: plantRow.id,
        status: {
          in: ["VALID_OPEN", "ONGOING", "CLOSED"],
        },
      },
      include: { area: true, workstation: true, unsafeActType: true, unsafeConditionType: true, nearMissType: true },
      orderBy: { eventDatetime: "desc" },
      take: 200,
    }),
    prisma.area.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.workstation.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.userPlantRole.findMany({
      where: { plantId: plantRow.id, user: { isActive: true } },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.employeeDirectory.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.bodyPart.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.injuryType.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.riskTheme.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }],
    }),
    prisma.unsafeActType.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }],
    }),
    prisma.unsafeConditionType.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }],
    }),
    prisma.nearMissType.findMany({
      where: { plantId: plantRow.id, isActive: true, code: { in: DEFAULT_NEAR_MISS_TYPE_CODES } },
      orderBy: { code: "asc" },
    }),
  ]);
  const localizedBodyParts = localizeBodyPartRows(bodyParts, userLanguage);
  const localizedInjuryTypes = localizeInjuryTypeRows(injuryTypes, userLanguage);
  const employeeByNumber = new Map(employees.map((employee) => [employee.employeeNo, employee]));

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{ui.modules.communications}</h1>
      </header>

      <CreateCommunicationQuick
        areas={areas.map((area) => ({ id: area.id, name: area.name }))}
        workstations={workstations.map((workstation) => ({ id: workstation.id, name: workstation.name }))}
        actionOwners={plantUsers.map((entry) => ({ id: entry.user.id, name: entry.user.name }))}
        employees={employees.map((employee) => ({ id: employee.id, name: employee.name, employeeNo: employee.employeeNo }))}
        bodyParts={localizedBodyParts.map((bodyPart) => ({ id: bodyPart.id, code: bodyPart.code ?? undefined, name: bodyPart.name }))}
        injuryTypes={localizedInjuryTypes.map((injuryType) => ({ id: injuryType.id, code: injuryType.code ?? undefined, name: injuryType.name }))}
        riskThemes={riskThemes.map((risk) => ({ id: risk.id, code: risk.code, category: risk.category, name: risk.name }))}
        unsafeActTypes={unsafeActTypes.map((type) => ({ id: type.id, code: type.code, category: type.category, name: type.name }))}
        unsafeConditionTypes={(canManageClassification ? unsafeConditionTypes : []).map((type) => ({ id: type.id, code: type.code, category: type.category, name: type.name }))}
        nearMissTypes={(canManageClassification ? nearMissTypes : []).map((type) => ({ id: type.id, code: type.code, name: type.name }))}
        canLinkAction={actorRole ? LINKED_ACTION_ROLES.includes(actorRole) : false}
        canManageClassification={canManageClassification}
      />

      <CommunicationsTable
        plant={plant}
        canDelete={canDeleteCommunications}
        canViewClassification={canManageClassification}
        rows={communications.map((row) => {
          const reporterEmployee = employeeByNumber.get(row.reporterEmployeeNo ?? "");
          return {
            id: row.id,
            eventDatetime: row.eventDatetime.toISOString(),
            type: row.type,
            status: row.status,
            reporterName: reporterEmployee ? `${reporterEmployee.employeeNo} - ${reporterEmployee.name}` : row.reporterName,
            department: row.area?.name ?? "-",
            location: row.workstation?.name ?? "-",
            unsafeActType: canManageClassification ? row.unsafeActType?.name ?? "-" : undefined,
            unsafeConditionType: canManageClassification ? row.unsafeConditionType?.name ?? "-" : undefined,
            nearMissType: canManageClassification ? row.nearMissType?.name ?? "-" : undefined,
          };
        })}
      />
    </>
  );
}
