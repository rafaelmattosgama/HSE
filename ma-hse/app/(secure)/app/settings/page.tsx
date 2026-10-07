import { MasterDataEntityType, RoleCode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { CorporatePlantForm } from "@/components/feature/corporate-plant-form";
import { ModuleToggleManager } from "@/components/feature/module-toggle-manager";
import { N0MasterDataManager } from "@/components/feature/n0-master-data-manager";
import { ProfessionalRisksManager } from "@/components/feature/professional-risks-manager";
import { ReportLayoutManager } from "@/components/feature/report-layout-manager";
import { SafetyCommunicationRecipientManager } from "@/components/feature/safety-communication-recipient-manager";
import { SettingsScopeNavigation } from "@/components/feature/settings-scope-navigation";
import { SettingsPlantSelector } from "@/components/feature/settings-plant-selector";
import { SewoRecipientListManager } from "@/components/feature/sewo-recipient-list-manager";
import { UserManager } from "@/components/feature/user-manager";
import {
  GLOBAL_MODULE_TOGGLES_PARAMETER_KEY,
  MODULE_TOGGLES_PARAMETER_KEY,
  resolveModuleToggles,
} from "@/lib/modules";
import { formatMasterDataMessage } from "@/lib/master-data-ui";
import { prisma } from "@/lib/prisma";
import { readGeneralCatalog } from "@/lib/services/general-settings-service";
import { readGeneralSewoRecipients } from "@/lib/services/general-sewo-recipients";
import { listGeneralUsers, GENERAL_USER_ROLES } from "@/lib/services/general-user-service";
import { getServerUiDictionary, getServerUiLocale } from "@/lib/server-ui-language";
import { getLocalizedN0MasterDataUi } from "@/lib/services/master-data-ui-localization";
import { localizeMasterDataRows } from "@/lib/services/master-data-translation-service";
import { SafetyCommunicationAlertService } from "@/lib/services/safety-communication-alert-service";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ plant?: string; scope?: string }>;
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
  const scope = currentSearchParams.scope === "plant" || (!currentSearchParams.scope && currentSearchParams.plant) ? "plant" : "general";
  const plantUserRoles: RoleCode[] = [RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N6_HR];
  const selectedPlantCode = allPlants.find((plant) => plant.code === currentSearchParams.plant)?.code ?? allPlants[0]?.code;
  const selectedPlant = scope === "plant" && selectedPlantCode
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
  const selectedPlantUsers = selectedPlant?.users.filter(entry => plantUserRoles.includes(entry.role.code)) ?? [];
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
  const [localizedAreas, localizedWorkstations, localizedEquipments] = selectedPlant
    ? await Promise.all([
        localizeMasterDataRows(MasterDataEntityType.AREA, selectedPlant.areas, uiLocale),
        localizeMasterDataRows(MasterDataEntityType.WORKSTATION, selectedPlant.workstations, uiLocale),
        localizeMasterDataRows(MasterDataEntityType.EQUIPMENT, selectedPlant.equipments, uiLocale),
      ])
    : [[], [], []];
  const localizedAreaById = new Map(localizedAreas.map((area) => [area.id, area.name]));
  const generalData = scope === "general" ? await Promise.all([
    readGeneralCatalog("unsafeActType"), readGeneralCatalog("unsafeConditionType"),
    readGeneralCatalog("nearMissType"), readGeneralCatalog("injuryType"), readGeneralCatalog("riskTheme"),
    readGeneralSewoRecipients(), listGeneralUsers(),
  ]) : null;
  const moduleLabels = {
    MAPA: ui.modules.mapa,
    VALIDATIONS: ui.modules.validation,
    ACTIONS: ui.modules.actions,
    SEWO: ui.modules.sewo,
    SMAT: ui.modules.smat,
    CONTRACTORS: ui.modules.contractors,
    COMMUNICATIONS: ui.modules.communications,
    MONTHLY_INPUTS: ui.modules.monthlyInputs,
    ENVIRONMENT_DASHBOARD: ui.modules.environmentDashboard,
    OCCUPATIONAL_HEALTH: ui.modules.occupationalHealth,
  };

  return (
    <main className="mx-auto w-full max-w-none space-y-6 px-6 py-6">
      <section className="sticky top-3 z-20 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" data-onboarding="system-settings">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{masterDataUi.n0Admin}</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">{ui.modules.settings}</h1>
          </div>
          {scope === "plant" ? <SettingsPlantSelector
            plants={allPlants.map((plant) => ({
              code: plant.code,
              name: plant.name,
              isActive: plant.isActive,
            }))}
            selectedPlantCode={selectedPlant?.code ?? selectedPlantCode}
            labels={masterDataUi}
          /> : <p className="text-sm text-slate-600">{masterDataUi.generalSettingsHelp}</p>}
        </div>
        <SettingsScopeNavigation scope={scope} labels={masterDataUi} />
      </section>

      {generalData ? (
        <div className="space-y-6" key="general">
          <div data-onboarding="settings-plants"><CorporatePlantForm mode="create" labels={masterDataUi} /></div>
          <N0MasterDataManager
            scope="general" catalogEndpoint="/api/admin/master-data" showWorkers={false}
            visibleCatalogTypes={["unsafeActType", "unsafeConditionType", "nearMissType", "injuryType"]}
            initialAreas={[]} initialWorkstations={[]} initialEquipments={[]} initialWorkers={[]}
            initialUnsafeActTypes={generalData[0].filter(row => row.isActive)}
            initialUnsafeConditionTypes={generalData[1].filter(row => row.isActive)}
            initialNearMissTypes={generalData[2].filter(row => row.isActive)}
            initialInjuryTypes={generalData[3].filter(row => row.isActive)}
            labels={{ ...masterDataUi, title: masterDataUi.generalMasterDataTitle }}
          />
          <ProfessionalRisksManager endpoint="/api/admin/professional-risks" initialRisks={generalData[4]} labels={masterDataUi} />
          <SewoRecipientListManager endpoint="/api/admin/sewo-report-recipients" initialRecipients={generalData[5]} labels={masterDataUi} />
          <div data-onboarding="settings-users"><UserManager
            endpoint="/api/admin/users" users={generalData[6]} allowedCreateRoles={[...GENERAL_USER_ROLES]}
            assignmentPlants={allPlants.map(plant => ({ id: plant.id, name: plant.name }))}
            labels={masterDataUi}
          /></div>
        </div>
      ) : selectedPlant ? (
        <div key={selectedPlant.code} className="space-y-6">
          <div data-onboarding="settings-plants">
            <CorporatePlantForm
              mode="manage"
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
            />
          </div>

          <section className="space-y-4" data-onboarding="settings-modules">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{masterDataUi.settingsSectionTitle}</p>
                <h2 className="text-xl font-semibold text-slate-900">{masterDataUi.globalModulesTitle}</h2>
              </div>
              <span className="w-fit rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-semibold text-slate-700">
                {selectedPlant.name}
              </span>
            </div>

            <div>
              <ModuleToggleManager
                key={`plant-modules:${selectedPlant.code}`}
                endpoint={`/api/plants/${selectedPlant.code}/admin/modules`}
                title={formatMasterDataMessage(masterDataUi.plantModulesTitle, { plant: selectedPlant.name })}
                description={masterDataUi.plantModulesHelp}
                saveLabel={masterDataUi.savePlantModules}
                applyToAll={{
                  endpoint: "/api/admin/modules/apply-all",
                  label: masterDataUi.applyModulesToAllPlants,
                  successMessage: masterDataUi.modulesAppliedToAllPlants,
                }}
                savingLabel={masterDataUi.saving}
                successMessage={masterDataUi.moduleSettingsSaved}
                errorMessage={masterDataUi.moduleSettingsError}
                helpButtonLabel={masterDataUi.helpButton}
                moduleLabels={moduleLabels}
                initialModules={resolveModuleToggles(
                  globalModuleParameter?.valueJson,
                  moduleParameter?.valueJson,
                )}
              />
            </div>
          </section>

          <N0MasterDataManager
            key={`n0-master-data:${selectedPlant.code}`}
            plantCode={selectedPlant.code}
            visibleCatalogTypes={["area", "workstation", "equipment"]}
            initialAreas={localizedAreas.map((item) => ({ id: item.id, code: item.code, name: item.name, originalName: item.originalName }))}
            initialWorkstations={localizedWorkstations.map((item) => ({ id: item.id, code: item.code, name: item.name, originalName: item.originalName }))}
            initialEquipments={localizedEquipments.map((item) => ({ id: item.id, code: item.code, name: item.name, originalName: item.originalName }))}
            initialWorkers={selectedPlant.employees.map((item) => ({ id: item.id, employeeNo: item.employeeNo, name: item.name, dept: item.dept }))}
            initialNearMissTypes={[]}
            initialUnsafeActTypes={[]}
            initialUnsafeConditionTypes={[]}
            initialInjuryTypes={[]}
            labels={masterDataUi}
          />

          <div data-onboarding="settings-users">
            <UserManager
              key={`users:${selectedPlant.code}`}
              plantCode={selectedPlant.code}
              users={selectedPlantUsers.map((entry) => ({
                id: entry.user.id,
                email: entry.user.email,
                name: entry.user.name,
                language: entry.user.language,
                isActive: entry.user.isActive,
                role: entry.role.code,
                departmentId: entry.departmentId,
                createdAt: entry.user.createdAt,
                updatedAt: entry.user.updatedAt,
              }))}
              allowedCreateRoles={plantUserRoles}
              manageableRoles={plantUserRoles}
              visibleRoles={plantUserRoles}
              labels={masterDataUi}
            />
          </div>

          <SafetyCommunicationRecipientManager
            plantCode={selectedPlant.code}
            initialRecipients={safetyCommunicationRecipients.map((recipient) => ({
              ...recipient,
              departmentName: localizedAreaById.get(recipient.departmentId) ?? recipient.departmentName,
            }))}
            users={safetyCommunicationRecipientOptions.users}
            departments={safetyCommunicationRecipientOptions.departments.map((department) => ({
              ...department,
              name: localizedAreaById.get(department.id) ?? department.name,
            }))}
            labels={masterDataUi}
          />

          <ReportLayoutManager
            plantCode={selectedPlant.code}
            initialLayouts={((reportLayoutParameter?.valueJson as Array<{ id: string; title: string; description: string }> | null) ?? [])}
            labels={masterDataUi}
          />
        </div>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          {masterDataUi.noPlantAvailable}
        </section>
      )}
    </main>
  );
}
