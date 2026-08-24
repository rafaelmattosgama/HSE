import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { RoleCode } from "@prisma/client";
import { authOptions } from "@/lib/auth/options";
import {
  GLOBAL_MODULE_TOGGLES_PARAMETER_KEY,
  MODULE_TOGGLES_PARAMETER_KEY,
  PLANT_NAVIGATION_MODULES,
  resolveModuleToggles,
} from "@/lib/modules";
import { AGGREGATE_PLANT_MODULES, ALL_PLANTS_SCOPE, isAllPlantsScope } from "@/lib/plant-scope";
import { PlantNav } from "@/components/layout/plant-nav";
import { PlantSwitcher } from "@/components/layout/plant-switcher";
import { InternalAgentChat } from "@/components/feature/internal-agent-chat";
import { RepeatabilityAlertModal } from "@/components/feature/repeatability-alert-modal";
import { SafetyCommunicationFloatingAlert } from "@/components/feature/safety-communication-floating-alert";
import { CompetenceUrgentAlert } from "@/components/feature/competence-urgent-alert";
import { shouldShowInternalAgentChat } from "@/lib/agent/ui-access";
import { normalizeInternalAgentLocale } from "@/lib/agent/i18n";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getServerUiDictionary } from "@/lib/server-ui-language";
import { SAFETY_DASHBOARD_VIEW_ROLES } from "@/lib/rbac/dashboard";

const items: Array<{ href: string; label: string; roles: RoleCode[]; spotlight?: boolean }> = [
  {
    href: "dashboards",
    label: "safetyDashboard",
    roles: [...SAFETY_DASHBOARD_VIEW_ROLES],
    spotlight: true,
  },
  { href: "environment-dashboard", label: "environmentDashboard", roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY] },
  { href: "validation", label: "validation", roles: [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY] },
  { href: "communications", label: "communications", roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N5_OPERATOR] },
  { href: "actions", label: "actions", roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N5_OPERATOR] },
  { href: "sewo", label: "S-EWO", roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY] },
  { href: "smat", label: "SMAT", roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR] },
  { href: "occupational-health", label: "occupationalHealth", roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY] },
  { href: "competences", label: "competences", roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N5_OPERATOR] },
  { href: "monthly-inputs", label: "monthlyInputs", roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY] },
  { href: "contractors", label: "contractors", roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR] },
  { href: "mapa", label: "mapa", roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N5_OPERATOR] },
  { href: "admin", label: "admin", roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY] },
];
const CORPORATE_ROLES: RoleCode[] = [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY];
export default async function PlantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ plant: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const { plant } = await params;
  const isAllPlants = isAllPlantsScope(plant);
  const hasGlobalPlantAccess = session.user.plantRoles.some(
    (entry) => entry.role === RoleCode.N0_ADMIN || entry.role === RoleCode.N1_CORPORATE,
  );
  const scopedPlantCodes = Array.from(
    new Set(session.user.plantRoles.map((entry) => entry.plantCode).filter((code): code is string => Boolean(code))),
  ).sort((left, right) => left.localeCompare(right));
  const accessiblePlants = hasGlobalPlantAccess
    ? await prisma.plant.findMany({
        where: { isActive: true },
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true, defaultLanguage: true },
      })
    : scopedPlantCodes.length
      ? await prisma.plant.findMany({
          where: { code: { in: scopedPlantCodes }, isActive: true },
          orderBy: { code: "asc" },
          select: { id: true, code: true, name: true, defaultLanguage: true },
        })
      : [];

  const hasPlantAccess = isAllPlants
    ? accessiblePlants.length > 1
    : accessiblePlants.some((entry) => entry.code === plant) || hasGlobalPlantAccess;
  if (!hasPlantAccess) {
    redirect("/app/corporate");
  }

  const plantRole = session.user.plantRoles.some((entry) => entry.role === RoleCode.N0_ADMIN)
    ? RoleCode.N0_ADMIN
    : session.user.plantRoles.some((entry) => entry.role === RoleCode.N1_CORPORATE)
      ? RoleCode.N1_CORPORATE
      : isAllPlants
        ? session.user.plantRoles.find((entry) => entry.plantCode)?.role
        : session.user.plantRoles.find((entry) => entry.plantCode === plant)?.role;
  const hasSafetyCommunicationAlerts = plantRole === RoleCode.N3_SAFETY || plantRole === RoleCode.N4_SUPERVISOR;
  const hasCompetenceUrgentAlerts = plantRole === RoleCode.N2_PLANT_MANAGER
    || plantRole === RoleCode.N3_SAFETY
    || plantRole === RoleCode.N4_SUPERVISOR
    || plantRole === RoleCode.N5_OPERATOR;
  const [plantRecord, globalModuleParameter] = await Promise.all([
    isAllPlants
      ? Promise.resolve(null)
      : prisma.plant.findUnique({
          where: { code: plant },
          include: {
            systemParameters: {
              where: {
                key: MODULE_TOGGLES_PARAMETER_KEY,
              },
            },
          },
        }),
    prisma.systemParameter.findFirst({
      where: {
        plantId: null,
        key: GLOBAL_MODULE_TOGGLES_PARAMETER_KEY,
      },
    }),
  ]);
  const unreadAlerts = plantRecord
    ? await prisma.notification.findMany({
        where: {
          userId: session.user.id,
          plantId: plantRecord.id,
          channel: {
            in: ["REPEATABILITY_ALERT", "SEWO_REJECTED", "COMPETENCE_ALERT"],
          },
          status: "UNREAD",
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 10,
      })
    : isAllPlants
      ? await prisma.notification.findMany({
          where: {
            userId: session.user.id,
            plantId: {
              in: accessiblePlants.map((entry) => entry.id),
            },
            channel: {
              in: ["REPEATABILITY_ALERT", "SEWO_REJECTED"],
            },
            status: "UNREAD",
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 10,
        })
    : [];
  const moduleToggles = resolveModuleToggles(
    globalModuleParameter?.valueJson,
    plantRecord?.systemParameters[0]?.valueJson,
  );
  const ui = await getServerUiDictionary({
    userLanguage: session.user.language,
    plantLanguage: plantRecord?.defaultLanguage,
  });
  const agentLocale = normalizeInternalAgentLocale(session.user.language);
  const visibleItems = items
    .filter((item) => (plantRole ? item.roles.includes(plantRole) : false))
    .filter((item) => (isAllPlants ? AGGREGATE_PLANT_MODULES.has(item.href) : true))
    .filter((item) => {
      const moduleKey = PLANT_NAVIGATION_MODULES[item.href];
      return moduleKey ? Boolean(moduleToggles[moduleKey]) : true;
    })
    .map((item) => ({
      href: `/app/${plant}/${item.href}`,
      label: ui.modules[item.label as keyof typeof ui.modules] ?? item.label,
      spotlight: item.spotlight,
      onboardingId: `sidebar-${item.href}`,
    }));
  const utilityItems =
    plantRole && CORPORATE_ROLES.includes(plantRole)
      ? [
          {
            href: "/app/corporate",
            label: ui.modules.corporate,
            onboardingId: "sidebar-corporate",
          },
          ...(plantRole === RoleCode.N0_ADMIN
            ? [
                {
                  href: "/app/settings",
                  label: ui.modules.settings,
                  onboardingId: "sidebar-settings",
                },
              ]
            : []),
        ]
      : [];
  const showInternalAgentChat = shouldShowInternalAgentChat({
    agentEnabled: env.AGENT_ENABLED,
    isAllPlants,
    role: plantRole,
  });

  return (
    <>
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-6 py-6 md:grid-cols-[240px_1fr]">
        <aside data-onboarding="sidebar" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:sticky md:top-6 md:max-h-[calc(100vh-48px)] md:self-start md:overflow-y-auto">
          <PlantSwitcher
            currentPlant={isAllPlants ? ALL_PLANTS_SCOPE : plant}
            plants={accessiblePlants.map((entry) => ({ code: entry.code, name: entry.name }))}
            allowAllPlants={accessiblePlants.length > 1}
          />
          <PlantNav items={visibleItems} utilityItems={utilityItems} />
        </aside>

        <section className="space-y-5">
          {plantRole === RoleCode.N1_CORPORATE || plantRole === RoleCode.N0_ADMIN ? (
            <Link
              href="/app/corporate"
              className="app-toolbar inline-flex items-center gap-2 rounded-full border-teal-200 bg-teal-50 px-4 py-1.5 text-sm font-semibold text-teal-800 hover:bg-teal-100"
            >
              <span aria-hidden="true">←</span>
              <span>{ui.modules.corporate}</span>
            </Link>
          ) : null}
          {children}
        </section>
      </div>

      {!isAllPlants ? (
        <RepeatabilityAlertModal
          plantCode={plant}
          title="Alerts"
          acknowledgeWithProfileAlerts={plantRole === RoleCode.N3_SAFETY || plantRole === RoleCode.N4_SUPERVISOR}
          alerts={unreadAlerts.map((alert) => ({
            id: alert.id,
            title: alert.title,
            body: alert.body,
            createdAt: alert.createdAt.toISOString(),
          }))}
        />
      ) : null}
      <SafetyCommunicationFloatingAlert plantCode={plant} enabled={!isAllPlants && hasSafetyCommunicationAlerts} />
      <CompetenceUrgentAlert plantCode={plant} labels={ui.competences} enabled={!isAllPlants && hasCompetenceUrgentAlerts} />
      {showInternalAgentChat ? <InternalAgentChat key={agentLocale} plantCode={plant} locale={agentLocale} /> : null}
    </>
  );
}
