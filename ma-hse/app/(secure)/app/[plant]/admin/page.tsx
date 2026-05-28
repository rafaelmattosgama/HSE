import { RoleCode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { getCreatableRoles } from "@/lib/rbac/user-management";
import { UserManager } from "@/components/feature/user-manager";
import { QrTokenManager } from "@/components/feature/qr-token-manager";
import { RepeatabilityAlertEditor } from "@/components/feature/repeatability-alert-editor";
import { SafetyCommunicationRecipientManager } from "@/components/feature/safety-communication-recipient-manager";
import { SafetyDaysAdminEditor } from "@/components/feature/safety-days-admin-editor";
import { SewoRecipientListManager } from "@/components/feature/sewo-recipient-list-manager";
import { SlaEditor } from "@/components/feature/sla-editor";
import { LanguageSelector } from "@/components/feature/language-selector";
import { MasterDataManager } from "@/components/feature/master-data-manager";
import { N0MasterDataManager } from "@/components/feature/n0-master-data-manager";
import { HelpPopover } from "@/components/ui/help-popover";
import { prisma } from "@/lib/prisma";
import { canManageSafetyCommunicationAlertRecipients } from "@/lib/rbac/safety-communication-alerts";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { getUiDictionary } from "@/lib/ui-language";
import { getPlantRepeatabilityAlertConfig, getPlantSafetyDaysConfig } from "@/lib/services/parameter-service";
import { ensureDefaultNearMissTypes } from "@/lib/services/near-miss-type-service";
import { getLocalizedN0MasterDataUi } from "@/lib/services/master-data-ui-localization";
import { SafetyCommunicationAlertService } from "@/lib/services/safety-communication-alert-service";
import { ensureDefaultUnsafeActTypes } from "@/lib/services/unsafe-act-type-service";
import { ensureDefaultUnsafeConditionTypes } from "@/lib/services/unsafe-condition-type-service";
import { listSewoReportRecipients } from "@/lib/services/sewo-recipient-service";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
  const { plant } = await params;
  const session = await getServerSession(authOptions);
  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });
  await Promise.all([
    ensureDefaultNearMissTypes(plantRow.id),
    ensureDefaultUnsafeActTypes(plantRow.id),
    ensureDefaultUnsafeConditionTypes(plantRow.id),
  ]);
  const uiLocale = await getServerUiLocale({
    userLanguage: session?.user.language,
    plantLanguage: plantRow.defaultLanguage,
  });
  const ui = getUiDictionary(uiLocale);
  const masterDataUi = await getLocalizedN0MasterDataUi(uiLocale);

  const actorRole = session?.user.plantRoles.some((entry) => entry.role === RoleCode.N0_ADMIN)
    ? RoleCode.N0_ADMIN
    : session?.user.plantRoles.some((entry) => entry.role === RoleCode.N1_CORPORATE)
      ? RoleCode.N1_CORPORATE
    : session?.user.plantRoles.find((entry) => entry.plantCode === plant)?.role;

  const canManageUsers =
    actorRole === RoleCode.N0_ADMIN || actorRole === RoleCode.N1_CORPORATE || actorRole === RoleCode.N3_SAFETY;
  const canManageSafetyCommunicationRecipients = canManageSafetyCommunicationAlertRecipients(actorRole);
  const allowedCreateRoles = actorRole ? getCreatableRoles(actorRole) : [];

  const [
    sla,
    recipients,
    rules,
    areas,
    workstations,
    equipments,
    workers,
    unsafeActTypes,
    unsafeConditionTypes,
    nearMissTypes,
    injuryTypes,
    safetyCommunicationRecipients,
    safetyCommunicationRecipientOptions,
    sewoRecipients,
    repeatabilityConfig,
    safetyDaysConfig,
  ] = await Promise.all([
    prisma.systemParameter.findUnique({
      where: {
        plantId_key: {
          plantId: plantRow.id,
          key: "SLA_CONFIG",
        },
      },
    }),
    prisma.reportRecipientList.findMany({
      where: {
        OR: [{ plantId: plantRow.id }, { scope: "CORPORATE" }],
      },
      include: {
        recipients: true,
      },
    }),
    prisma.alertRule.findMany({
      where: {
        plantId: plantRow.id,
      },
      include: {
        repetitionRule: true,
      },
    }),
    prisma.area.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.workstation.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.equipment.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.employeeDirectory.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
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
      where: { plantId: plantRow.id, isActive: true },
      orderBy: [{ code: "asc" }, { name: "asc" }],
    }),
    prisma.injuryType.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: [{ code: "asc" }, { name: "asc" }],
    }),
    canManageSafetyCommunicationRecipients
      ? SafetyCommunicationAlertService.listRecipients(plantRow.id)
      : Promise.resolve([]),
    canManageSafetyCommunicationRecipients
      ? SafetyCommunicationAlertService.listRecipientOptions(plantRow.id)
      : Promise.resolve({ users: [], departments: [] }),
    listSewoReportRecipients(plantRow.id),
    getPlantRepeatabilityAlertConfig(plantRow.id),
    getPlantSafetyDaysConfig(plantRow.id),
  ]);

  const userPlantRoles = canManageUsers
    ? await prisma.userPlantRole.findMany({
        where: {
          plantId: plantRow.id,
        },
        include: {
          role: true,
          user: true,
        },
      })
    : [];

  const slaConfig = (sla?.valueJson as { LOW?: number; MEDIUM?: number; HIGH?: number } | null) ?? {
    LOW: 21,
    MEDIUM: 14,
    HIGH: 7,
  };

  const users = userPlantRoles
    .map((entry) => ({
      id: entry.user.id,
      email: entry.user.email,
      name: entry.user.name,
      language: entry.user.language,
      isActive: entry.user.isActive,
      role: entry.role.code,
      createdAt: entry.user.createdAt,
      updatedAt: entry.user.updatedAt,
    }))
    .sort((a, b) => {
      if (a.role !== b.role) return a.role.localeCompare(b.role);
      return a.name.localeCompare(b.name);
    });

  return (
    <>
      <header className="rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{ui.modules.admin}</h1>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{ui.modules.settings}</h2>
        <LanguageSelector currentLocale={uiLocale} label={ui.dashboard.language} />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <SlaEditor
          initial={{
            LOW: Number(slaConfig.LOW ?? 21),
            MEDIUM: Number(slaConfig.MEDIUM ?? 14),
            HIGH: Number(slaConfig.HIGH ?? 7),
          }}
          labels={masterDataUi}
        />
        <SafetyDaysAdminEditor
          initialManualLastAccidentDate={safetyDaysConfig.manualLastAccidentDate}
          initialHistoricalRecordDays={safetyDaysConfig.historicalRecordDays}
          initialHistoricalRecordStartDate={safetyDaysConfig.historicalRecordStartDate}
          labels={masterDataUi}
        />
        <QrTokenManager labels={masterDataUi} />
      </section>

      <RepeatabilityAlertEditor
        endpoint={`/api/plants/${plant}/admin/repeatability-alerts`}
        title={ui.dashboard.repeatabilityAlerts}
        description={ui.dashboard.plantRepeatabilityAlertsDescription}
        initial={repeatabilityConfig}
        labels={ui.dashboard}
      />

      {actorRole === RoleCode.N0_ADMIN ? (
        <N0MasterDataManager
          key={plant}
          plantCode={plant}
          initialAreas={areas.map((item) => ({ id: item.id, code: item.code, name: item.name }))}
          initialWorkstations={workstations.map((item) => ({ id: item.id, code: item.code, name: item.name }))}
          initialEquipments={equipments.map((item) => ({ id: item.id, code: item.code, name: item.name }))}
          initialWorkers={workers.map((item) => ({ id: item.id, employeeNo: item.employeeNo, name: item.name, dept: item.dept }))}
          initialNearMissTypes={nearMissTypes.map((item) => ({ id: item.id, code: item.code, name: item.name }))}
          initialUnsafeActTypes={unsafeActTypes.map((item) => ({ id: item.id, code: item.code, name: item.name, category: item.category }))}
          initialUnsafeConditionTypes={unsafeConditionTypes.map((item) => ({ id: item.id, code: item.code, name: item.name, category: item.category }))}
          initialInjuryTypes={injuryTypes.map((item) => ({ id: item.id, code: item.code, name: item.name }))}
          labels={masterDataUi}
        />
      ) : (
        <MasterDataManager
          key={plant}
          plantCode={plant}
          initialAreas={areas.map((item) => ({ id: item.id, code: item.code, name: item.name }))}
          initialWorkstations={workstations.map((item) => ({ id: item.id, code: item.code, name: item.name }))}
          initialWorkers={workers.map((item) => ({ id: item.id, employeeNo: item.employeeNo, name: item.name, dept: item.dept }))}
          labels={masterDataUi}
        />
      )}

      {actorRole === RoleCode.N0_ADMIN ? (
        <SewoRecipientListManager
          plantCode={plant}
          initialRecipients={sewoRecipients}
          labels={masterDataUi}
        />
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{ui.dashboard.recipientLists}</h2>
            <HelpPopover title={ui.dashboard.recipientLists} body={masterDataUi.recipientListsHelp} buttonLabel={masterDataUi.helpButton} />
          </div>
          <div className="mt-3 space-y-3">
            {recipients.map((list) => (
              <article key={list.id} className="rounded-md border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-900">{list.name} ({list.scope})</p>
                <p className="text-xs text-slate-600">
                  {list.recipients.length} {ui.dashboard.recipients}
                </p>
              </article>
            ))}
            {recipients.length === 0 ? <p className="text-sm text-slate-600">{masterDataUi.noRecipientLists}</p> : null}
          </div>
        </section>
      )}

      {canManageSafetyCommunicationRecipients ? (
        <SafetyCommunicationRecipientManager
          plantCode={plant}
          initialRecipients={safetyCommunicationRecipients}
          users={safetyCommunicationRecipientOptions.users}
          departments={safetyCommunicationRecipientOptions.departments}
          labels={masterDataUi}
        />
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{ui.dashboard.alertRules}</h2>
          <HelpPopover title={ui.dashboard.alertRules} body={masterDataUi.alertRulesHelp} buttonLabel={masterDataUi.helpButton} />
        </div>
        <div className="mt-3 space-y-3">
          {rules.map((rule) => (
            <article key={rule.id} className="rounded-md border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">{rule.name}</p>
              <p className="text-xs text-slate-600">
                {rule.repetitionRule?.triggerType} - {ui.dashboard.threshold} {rule.repetitionRule?.thresholdCount} /{" "}
                {rule.repetitionRule?.windowDays} {ui.dashboard.days}
              </p>
            </article>
          ))}
          {rules.length === 0 ? <p className="text-sm text-slate-600">{masterDataUi.noAlertRules}</p> : null}
        </div>
      </section>

      {canManageUsers ? (
        <UserManager users={users} allowedCreateRoles={allowedCreateRoles} labels={masterDataUi} />
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm">
          {ui.dashboard.userManagementUnavailable}
        </section>
      )}
    </>
  );
}
