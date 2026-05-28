import { RoleCode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { CorporatePlantForm } from "@/components/feature/corporate-plant-form";
import { ModuleToggleManager } from "@/components/feature/module-toggle-manager";
import { N0MasterDataManager } from "@/components/feature/n0-master-data-manager";
import { PlantLanguageSettings } from "@/components/feature/plant-language-settings";
import { ProfessionalRisksManager } from "@/components/feature/professional-risks-manager";
import { ReportLayoutManager } from "@/components/feature/report-layout-manager";
import { SafetyCommunicationRecipientManager } from "@/components/feature/safety-communication-recipient-manager";
import { SettingsPlantSelector } from "@/components/feature/settings-plant-selector";
import { SewoRecipientListManager } from "@/components/feature/sewo-recipient-list-manager";
import { UserManager } from "@/components/feature/user-manager";
import {
  DEFAULT_MODULE_TOGGLES,
  GLOBAL_MODULE_TOGGLES_PARAMETER_KEY,
  MODULE_TOGGLES_PARAMETER_KEY,
} from "@/lib/modules";
import { formatMasterDataMessage } from "@/lib/master-data-ui";
import { prisma } from "@/lib/prisma";
import { getCreatableRoles } from "@/lib/rbac/user-management";
import { getServerUiDictionary, getServerUiLocale } from "@/lib/server-ui-language";
import { ensureDefaultProfessionalRisks } from "@/lib/services/professional-risk-service";
import { ensureDefaultNearMissTypes } from "@/lib/services/near-miss-type-service";
import { getLocalizedN0MasterDataUi } from "@/lib/services/master-data-ui-localization";
import { SafetyCommunicationAlertService } from "@/lib/services/safety-communication-alert-service";
import { listSewoReportRecipients } from "@/lib/services/sewo-recipient-service";
import { ensureDefaultUnsafeActTypes } from "@/lib/services/unsafe-act-type-service";
import { ensureDefaultUnsafeConditionTypes } from "@/lib/services/unsafe-condition-type-service";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ plant?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const isN0 = session.user.plantRoles.some((entry) => entry.role === RoleCode.N0_ADMIN);
  if (!isN0) {
    redirect("/app/corporate");
  }

  const allPlants = await prisma.plant.findMany({
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
      code: true,
      name: true,
      timezone: true,
      defaultLanguage: true,
      isActive: true,
    },
  });
  const globalModuleParameter = await prisma.systemParameter.findFirst({
    where: {
      plantId: null,
      key: GLOBAL_MODULE_TOGGLES_PARAMETER_KEY,
    },
  });

  const currentSearchParams = await searchParams;
  const selectedPlantCode = currentSearchParams.plant ?? allPlants[0]?.code;
  const selectedPlantId = allPlants.find((plant) => plant.code === selectedPlantCode)?.id;
  if (selectedPlantId) {
    await Promise.all([
      ensureDefaultProfessionalRisks(selectedPlantId),
      ensureDefaultNearMissTypes(selectedPlantId),
      ensureDefaultUnsafeActTypes(selectedPlantId),
      ensureDefaultUnsafeConditionTypes(selectedPlantId),
    ]);
  }
  const selectedPlant = selectedPlantCode
    ? await prisma.plant.findUnique({
        where: { code: selectedPlantCode },
        include: {
          areas: {
            where: { isActive: true },
            orderBy: { name: "asc" },
          },
          workstations: {
            where: { isActive: true },
            orderBy: { name: "asc" },
          },
          equipments: {
            where: { isActive: true },
            orderBy: { name: "asc" },
          },
          employees: {
            where: { isActive: true },
            orderBy: { name: "asc" },
          },
          riskThemes: {
            where: { isActive: true },
            orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }],
          },
          unsafeActTypes: {
            where: { isActive: true },
            orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }],
          },
          unsafeCondTypes: {
            where: { isActive: true },
            orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }],
          },
          nearMissTypes: {
            where: { isActive: true },
            orderBy: [{ code: "asc" }, { name: "asc" }],
          },
          injuryTypes: {
            where: { isActive: true },
            orderBy: [{ code: "asc" }, { name: "asc" }],
          },
          users: {
            include: {
              role: true,
              user: true,
            },
          },
          systemParameters: true,
        },
      })
    : null;

  const moduleParameter = selectedPlant?.systemParameters.find((entry) => entry.key === MODULE_TOGGLES_PARAMETER_KEY);
  const reportLayoutParameter = selectedPlant?.systemParameters.find((entry) => entry.key === "REPORT_LAYOUT");
  const sewoRecipients = selectedPlant ? await listSewoReportRecipients(selectedPlant.id) : [];
  const safetyCommunicationRecipients = selectedPlant
    ? await SafetyCommunicationAlertService.listRecipients(selectedPlant.id)
    : [];
  const safetyCommunicationRecipientOptions = selectedPlant
    ? await SafetyCommunicationAlertService.listRecipientOptions(selectedPlant.id)
    : { users: [], departments: [] };
  const uiLocale = await getServerUiLocale({
    userLanguage: session.user.language,
    plantLanguage: selectedPlant?.defaultLanguage,
  });
  const ui = await getServerUiDictionary({
    userLanguage: session.user.language,
    plantLanguage: selectedPlant?.defaultLanguage,
  });
  const masterDataUi = await getLocalizedN0MasterDataUi(uiLocale);
  const moduleLabels = {
    MAPA: ui.modules.mapa,
    VALIDATIONS: ui.modules.validation,
    ACTIONS: ui.modules.actions,
    SEWO: ui.modules.sewo,
    SMAT: ui.modules.smat,
    CONTRACTORS: ui.modules.contractors,
    COMMUNICATIONS: ui.modules.communications,
    MONTHLY_INPUTS: ui.modules.monthlyInputs,
    OCCUPATIONAL_HEALTH: ui.modules.occupationalHealth,
  };

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-6 py-6">
      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{masterDataUi.n0Admin}</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">{ui.modules.settings}</h1>
          </div>
          <SettingsPlantSelector
            plants={allPlants.map((plant) => ({
              code: plant.code,
              name: plant.name,
              isActive: plant.isActive,
            }))}
            selectedPlantCode={selectedPlant?.code ?? selectedPlantCode}
            labels={masterDataUi}
          />
        </div>
      </section>

      <CorporatePlantForm
        plants={allPlants.map((plant) => ({
          id: plant.id,
          code: plant.code,
          name: plant.name,
          timezone: plant.timezone,
          defaultLanguage: plant.defaultLanguage as "pt" | "it" | "en" | "pl" | "de" | "ro" | "fr",
          isActive: plant.isActive,
        }))}
        selectedPlantId={selectedPlant?.id ?? null}
        labels={masterDataUi}
        showPlantSelector={false}
      />

      {selectedPlant ? (
        <>
          <PlantLanguageSettings
            plantId={selectedPlant.id}
            plantName={selectedPlant.name}
            plantCode={selectedPlant.code}
            timezone={selectedPlant.timezone}
            defaultLanguage={selectedPlant.defaultLanguage}
            labels={masterDataUi}
          />

          <section className="space-y-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{masterDataUi.settingsSectionTitle}</p>
                <h2 className="text-xl font-semibold text-slate-900">{masterDataUi.globalModulesTitle}</h2>
              </div>
              <span className="w-fit rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-slate-700">
                {selectedPlant.name}
              </span>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <ModuleToggleManager
                endpoint="/api/admin/modules"
                title={masterDataUi.globalModulesTitle}
                description={masterDataUi.globalModulesHelp}
                saveLabel={masterDataUi.saveGlobalModules}
                savingLabel={masterDataUi.saving}
                successMessage={masterDataUi.moduleSettingsSaved}
                errorMessage={masterDataUi.moduleSettingsError}
                helpButtonLabel={masterDataUi.helpButton}
                moduleLabels={moduleLabels}
                initialModules={{
                  ...DEFAULT_MODULE_TOGGLES,
                  ...((globalModuleParameter?.valueJson as Record<string, boolean> | null) ?? {}),
                }}
              />

              <ModuleToggleManager
                endpoint={`/api/plants/${selectedPlant.code}/admin/modules`}
                title={formatMasterDataMessage(masterDataUi.plantModulesTitle, { plant: selectedPlant.name })}
                description={masterDataUi.plantModulesHelp}
                saveLabel={masterDataUi.savePlantModules}
                savingLabel={masterDataUi.saving}
                successMessage={masterDataUi.moduleSettingsSaved}
                errorMessage={masterDataUi.moduleSettingsError}
                helpButtonLabel={masterDataUi.helpButton}
                moduleLabels={moduleLabels}
                initialModules={{
                  ...DEFAULT_MODULE_TOGGLES,
                  ...((globalModuleParameter?.valueJson as Record<string, boolean> | null) ?? {}),
                  ...((moduleParameter?.valueJson as Record<string, boolean> | null) ?? {}),
                }}
              />
            </div>
          </section>

          <N0MasterDataManager
            key={selectedPlant.code}
            plantCode={selectedPlant.code}
            initialAreas={selectedPlant.areas.map((item) => ({ id: item.id, code: item.code, name: item.name }))}
            initialWorkstations={selectedPlant.workstations.map((item) => ({ id: item.id, code: item.code, name: item.name }))}
            initialEquipments={selectedPlant.equipments.map((item) => ({ id: item.id, code: item.code, name: item.name }))}
            initialWorkers={selectedPlant.employees.map((item) => ({ id: item.id, employeeNo: item.employeeNo, name: item.name, dept: item.dept }))}
            initialNearMissTypes={selectedPlant.nearMissTypes.map((item) => ({ id: item.id, code: item.code, name: item.name }))}
            initialUnsafeActTypes={selectedPlant.unsafeActTypes.map((item) => ({ id: item.id, code: item.code, name: item.name, category: item.category }))}
            initialUnsafeConditionTypes={selectedPlant.unsafeCondTypes.map((item) => ({ id: item.id, code: item.code, name: item.name, category: item.category }))}
            initialInjuryTypes={selectedPlant.injuryTypes.map((item) => ({ id: item.id, code: item.code, name: item.name }))}
            labels={masterDataUi}
          />

          <SewoRecipientListManager
            plantCode={selectedPlant.code}
            initialRecipients={sewoRecipients}
            labels={masterDataUi}
          />

          <ProfessionalRisksManager
            plantCode={selectedPlant.code}
            initialRisks={selectedPlant.riskThemes.map((risk) => ({
              id: risk.id,
              code: risk.code,
              category: risk.category,
              name: risk.name,
              isActive: risk.isActive,
            }))}
            labels={masterDataUi}
          />

          <UserManager
            plantCode={selectedPlant.code}
            users={selectedPlant.users.map((entry) => ({
              id: entry.user.id,
              email: entry.user.email,
              name: entry.user.name,
              language: entry.user.language,
              isActive: entry.user.isActive,
              role: entry.role.code,
              createdAt: entry.user.createdAt,
              updatedAt: entry.user.updatedAt,
            }))}
            allowedCreateRoles={getCreatableRoles(RoleCode.N0_ADMIN)}
            labels={masterDataUi}
          />

          <SafetyCommunicationRecipientManager
            plantCode={selectedPlant.code}
            initialRecipients={safetyCommunicationRecipients}
            users={safetyCommunicationRecipientOptions.users}
            departments={safetyCommunicationRecipientOptions.departments}
            labels={masterDataUi}
          />

          <ReportLayoutManager
            plantCode={selectedPlant.code}
            initialLayouts={((reportLayoutParameter?.valueJson as Array<{ id: string; title: string; description: string }> | null) ?? [])}
            labels={masterDataUi}
          />
        </>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          {masterDataUi.noPlantAvailable}
        </section>
      )}
    </main>
  );
}
