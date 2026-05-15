import Link from "next/link";
import { RoleCode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { CorporatePlantForm } from "@/components/feature/corporate-plant-form";
import { MasterDataManager } from "@/components/feature/master-data-manager";
import { ModuleToggleManager } from "@/components/feature/module-toggle-manager";
import { PlantLanguageSettings } from "@/components/feature/plant-language-settings";
import { ProfessionalRisksManager } from "@/components/feature/professional-risks-manager";
import { ReportLayoutManager } from "@/components/feature/report-layout-manager";
import { UserManager } from "@/components/feature/user-manager";
import {
  DEFAULT_MODULE_TOGGLES,
  GLOBAL_MODULE_TOGGLES_PARAMETER_KEY,
  MODULE_TOGGLES_PARAMETER_KEY,
} from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { getCreatableRoles } from "@/lib/rbac/user-management";
import { getServerUiDictionary } from "@/lib/server-ui-language";
import { ensureDefaultProfessionalRisks } from "@/lib/services/professional-risk-service";

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
    await ensureDefaultProfessionalRisks(selectedPlantId);
  }
  const selectedPlant = selectedPlantCode
    ? await prisma.plant.findUnique({
        where: { code: selectedPlantCode },
        include: {
          areas: {
            orderBy: { name: "asc" },
          },
          workstations: {
            orderBy: { name: "asc" },
          },
          employees: {
            orderBy: { name: "asc" },
          },
          riskThemes: {
            orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }],
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
  const ui = await getServerUiDictionary({
    userLanguage: session.user.language,
    plantLanguage: selectedPlant?.defaultLanguage,
  });
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
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">N0 Admin</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">{ui.modules.settings}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {allPlants.map((plant) => (
              <Link
                key={plant.id}
                href={`/app/settings?plant=${plant.code}`}
                className={`rounded-full border px-4 py-2 text-sm font-medium ${
                  plant.code === selectedPlantCode
                    ? "border-teal-300 bg-teal-50 text-teal-900"
                    : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                {plant.name}
              </Link>
            ))}
          </div>
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
      />

      {selectedPlant ? (
        <>
          <PlantLanguageSettings
            plantId={selectedPlant.id}
            plantName={selectedPlant.name}
            plantCode={selectedPlant.code}
            timezone={selectedPlant.timezone}
            defaultLanguage={selectedPlant.defaultLanguage}
          />

          <div className="grid gap-6 xl:grid-cols-2">
            <ModuleToggleManager
              endpoint="/api/admin/modules"
              title="Plant Modules"
              description="Activate or deactivate modules globally for all plants. Plant-specific settings can still override these defaults."
              saveLabel="Save global modules"
              moduleLabels={moduleLabels}
              initialModules={{
                ...DEFAULT_MODULE_TOGGLES,
                ...((globalModuleParameter?.valueJson as Record<string, boolean> | null) ?? {}),
              }}
            />

            <ModuleToggleManager
              endpoint={`/api/plants/${selectedPlant.code}/admin/modules`}
              title={`Plant Modules: ${selectedPlant.name}`}
              description="Activate or deactivate modules only for the selected plant."
              saveLabel="Save plant modules"
              moduleLabels={moduleLabels}
              initialModules={{
                ...DEFAULT_MODULE_TOGGLES,
                ...((globalModuleParameter?.valueJson as Record<string, boolean> | null) ?? {}),
                ...((moduleParameter?.valueJson as Record<string, boolean> | null) ?? {}),
              }}
            />
          </div>

          <MasterDataManager
            key={selectedPlant.code}
            plantCode={selectedPlant.code}
            initialAreas={selectedPlant.areas.map((item) => ({ id: item.id, code: item.code, name: item.name }))}
            initialWorkstations={selectedPlant.workstations.map((item) => ({ id: item.id, code: item.code, name: item.name }))}
            initialWorkers={selectedPlant.employees.map((item) => ({ id: item.id, employeeNo: item.employeeNo, name: item.name, dept: item.dept }))}
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
          />

          <ReportLayoutManager
            plantCode={selectedPlant.code}
            initialLayouts={((reportLayoutParameter?.valueJson as Array<{ id: string; title: string; description: string }> | null) ?? [])}
          />
        </>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          No plant available yet. Create the first plant above.
        </section>
      )}
    </main>
  );
}
