import { History } from "lucide-react";
import Link from "next/link";
import { RoleCode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { resolveDashboardPeriod, type DashboardSearchParams } from "@/lib/dashboard-period";
import { buildMonthBuckets } from "@/lib/dashboard-visualization";
import { prisma } from "@/lib/prisma";
import { buildEnvironmentDashboardPlant } from "@/lib/environment-dashboard";
import { getGroupSafetyDashboard, groupSafetyPlantWhere } from "@/lib/services/group-safety-dashboard-service";
import { previousSafetyPeriod } from "@/lib/group-safety-dashboard";
import { getUiDictionary } from "@/lib/ui-language";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { EnvironmentDashboardBoard } from "@/components/feature/environment-dashboard-board";
import { GroupDashboardAreaNavigation, GroupDashboardFilters, GroupSafetyDashboard } from "@/components/feature/group-safety-dashboard";
import { RepeatabilityAlertEditor } from "@/components/feature/repeatability-alert-editor";
import { getGlobalRepeatabilityAlertConfig } from "@/lib/services/parameter-service";

export default async function CorporatePage({ searchParams }: { searchParams: Promise<DashboardSearchParams> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const locale = await getServerUiLocale({ userLanguage: session.user.language });
  const ui = getUiDictionary(locale);
  const params = await searchParams;
  const rawArea = Array.isArray(params.area) ? params.area[0] : params.area;
  const area = rawArea === "environment" ? "environment" : "safety";
  const period = resolveDashboardPeriod(params);
  const displayPeriod = { ...period, from: period.from.toISOString().slice(0, 10), to: period.to.toISOString().slice(0, 10) };
  const defaultPlantRole = session.user.plantRoles.find(entry => entry.plantCode);

  let content;
  if (area === "safety") {
    const canManage = session.user.plantRoles.some(entry => entry.role === RoleCode.N0_ADMIN || entry.role === RoleCode.N1_CORPORATE);
    const [dataset, alertConfig] = await Promise.all([
      getGroupSafetyDashboard(session.user.plantRoles, period),
      canManage ? getGlobalRepeatabilityAlertConfig() : null,
    ]);
    const management = alertConfig ? <details className="app-card"><summary className="cursor-pointer text-sm font-semibold">{ui.dashboard.globalRepeatabilityAlerts}</summary><div className="mt-4"><RepeatabilityAlertEditor endpoint="/api/admin/repeatability-alerts" title={ui.dashboard.globalRepeatabilityAlerts} description={ui.dashboard.globalRepeatabilityAlertsDescription} initial={alertConfig} labels={ui.dashboard} /></div></details> : undefined;
    content = <GroupSafetyDashboard plants={dataset.plants} loadedAt={dataset.loadedAt} locale={locale} period={displayPeriod} management={management} />;
  } else {
    // Keep the environmental data source and aggregation independent of safety views.
    const buckets = buildMonthBuckets(period.from, period.to);
    const previousPeriod = previousSafetyPeriod(period.from, period.to);
    const previousBuckets = buildMonthBuckets(previousPeriod.from, previousPeriod.to);
    const where = groupSafetyPlantWhere(session.user.plantRoles);
    const [plants, previousRows] = await Promise.all([
      prisma.plant.findMany({ where, select: { id: true, code: true, name: true, monthlyInputs: { where: { OR: buckets.map(({ year, month }) => ({ year, month })) } } } }),
      prisma.plantMonthlyInput.findMany({ where: { plant: where, OR: previousBuckets.map(({ year, month }) => ({ year, month })) } }),
    ]);
    const environmentPlants = plants.map(plant => buildEnvironmentDashboardPlant({ ...plant, rows: plant.monthlyInputs }));
    const comparisonPlants = plants.map(plant => buildEnvironmentDashboardPlant({ ...plant, rows: previousRows.filter(row => row.plantId === plant.id) }));
    content = <>
      <GroupDashboardFilters locale={locale} period={displayPeriod} area="environment" />
      <EnvironmentDashboardBoard title={ui.modules.environmentDashboard} scopeLabel={`${plants.length} ${ui.dashboard.plants.toLowerCase()}`} periodLabel={period.label} plants={environmentPlants} comparisonPlants={comparisonPlants} periodMonthsCount={buckets.length} storageKeyBase="ma-hse-environment-corporate" className="mb-6" labels={ui.dashboard} />
    </>;
  }

  return <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
    <header className="app-hero mb-6 rounded-2xl p-5 sm:p-6" data-onboarding="corporate-overview">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">{ui.dashboard.corporateTitle}</h1><p className="mt-2 text-sm text-slate-600">{area === "safety" ? ui.modules.safetyDashboard : ui.modules.environmentDashboard}</p></div>
        <div className="flex flex-wrap items-center gap-3">
          {defaultPlantRole?.plantCode && <Link href={`/app/${defaultPlantRole.plantCode}/dashboards`} className="app-toolbar">{ui.dashboard.backToPlant.replace("{plant}", defaultPlantRole.plantCode.toUpperCase())}</Link>}
          <Link href="/app/corporate/reports" data-onboarding="corporate-reports" className="app-toolbar text-teal-700"><History aria-hidden="true" className="h-4 w-4" />{ui.dashboard.openReportHistory}</Link>
        </div>
      </div>
      <GroupDashboardAreaNavigation locale={locale} area={area} />
    </header>
    {content}
  </main>;
}
