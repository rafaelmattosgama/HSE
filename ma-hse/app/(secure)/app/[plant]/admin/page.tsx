import { RoleCode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { getCreatableRoles } from "@/lib/rbac/user-management";
import { UserManager } from "@/components/feature/user-manager";
import { QrTokenManager } from "@/components/feature/qr-token-manager";
import { RepeatabilityAlertEditor } from "@/components/feature/repeatability-alert-editor";
import { SafetyDaysAdminEditor } from "@/components/feature/safety-days-admin-editor";
import { SlaEditor } from "@/components/feature/sla-editor";
import { LanguageSelector } from "@/components/feature/language-selector";
import { MasterDataManager } from "@/components/feature/master-data-manager";
import { UnsafeActTypeManager } from "@/components/feature/unsafe-act-type-manager";
import { prisma } from "@/lib/prisma";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { getUiDictionary } from "@/lib/ui-language";
import { getPlantRepeatabilityAlertConfig, getPlantSafetyDaysConfig } from "@/lib/services/parameter-service";
import { ensureDefaultUnsafeActTypes } from "@/lib/services/unsafe-act-type-service";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
  const { plant } = await params;
  const session = await getServerSession(authOptions);
  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });
  await ensureDefaultUnsafeActTypes(plantRow.id);
  const uiLocale = await getServerUiLocale({
    userLanguage: session?.user.language,
    plantLanguage: plantRow.defaultLanguage,
  });
  const ui = getUiDictionary(uiLocale);

  const actorRole = session?.user.plantRoles.some((entry) => entry.role === RoleCode.N0_ADMIN)
    ? RoleCode.N0_ADMIN
    : session?.user.plantRoles.some((entry) => entry.role === RoleCode.N1_CORPORATE)
      ? RoleCode.N1_CORPORATE
    : session?.user.plantRoles.find((entry) => entry.plantCode === plant)?.role;

  const canManageUsers =
    actorRole === RoleCode.N0_ADMIN || actorRole === RoleCode.N1_CORPORATE || actorRole === RoleCode.N3_SAFETY;
  const allowedCreateRoles = actorRole ? getCreatableRoles(actorRole) : [];

  const [sla, recipients, rules, areas, workstations, workers, unsafeActTypes, repeatabilityConfig, safetyDaysConfig] = await Promise.all([
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
    prisma.employeeDirectory.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.unsafeActType.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }],
    }),
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
        />
        <SafetyDaysAdminEditor
          initialManualLastAccidentDate={safetyDaysConfig.manualLastAccidentDate}
          initialHistoricalRecordDays={safetyDaysConfig.historicalRecordDays}
          initialHistoricalRecordStartDate={safetyDaysConfig.historicalRecordStartDate}
        />
        <QrTokenManager />
      </section>

      <RepeatabilityAlertEditor
        endpoint={`/api/plants/${plant}/admin/repeatability-alerts`}
        title={ui.dashboard.repeatabilityAlerts}
        description={ui.dashboard.plantRepeatabilityAlertsDescription}
        initial={repeatabilityConfig}
        labels={ui.dashboard}
      />

      <MasterDataManager
        key={plant}
        plantCode={plant}
        initialAreas={areas.map((item) => ({ id: item.id, code: item.code, name: item.name }))}
        initialWorkstations={workstations.map((item) => ({ id: item.id, code: item.code, name: item.name }))}
        initialWorkers={workers.map((item) => ({ id: item.id, employeeNo: item.employeeNo, name: item.name, dept: item.dept }))}
      />

      {actorRole === RoleCode.N0_ADMIN ? (
        <UnsafeActTypeManager
          plantCode={plant}
          initialTypes={unsafeActTypes.map((type) => ({
            id: type.id,
            code: type.code,
            category: type.category,
            name: type.name,
          }))}
        />
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{ui.dashboard.recipientLists}</h2>
        <div className="mt-3 space-y-3">
          {recipients.map((list) => (
            <article key={list.id} className="rounded-md border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">{list.name} ({list.scope})</p>
              <p className="text-xs text-slate-600">
                {list.recipients.length} {ui.dashboard.recipients}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{ui.dashboard.alertRules}</h2>
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
        </div>
      </section>

      {canManageUsers ? (
        <UserManager users={users} allowedCreateRoles={allowedCreateRoles} />
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm">
          {ui.dashboard.userManagementUnavailable}
        </section>
      )}
    </>
  );
}
