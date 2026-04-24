import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { RoleCode } from "@prisma/client";
import { authOptions } from "@/lib/auth/options";
import {
  DEFAULT_MODULE_TOGGLES,
  GLOBAL_MODULE_TOGGLES_PARAMETER_KEY,
  MODULE_TOGGLES_PARAMETER_KEY,
} from "@/lib/modules";
import { RepeatabilityAlertModal } from "@/components/feature/repeatability-alert-modal";
import { prisma } from "@/lib/prisma";
import { getUiDictionary } from "@/lib/ui-language";

const items: Array<{ href: string; label: string; roles: RoleCode[]; spotlight?: boolean }> = [
  {
    href: "dashboards",
    label: "safetyDashboard",
    roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N5_OPERATOR],
    spotlight: true,
  },
  { href: "environment-dashboard", label: "environmentDashboard", roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY] },
  { href: "validation", label: "validation", roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY] },
  { href: "communications", label: "communications", roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N5_OPERATOR] },
  { href: "actions", label: "actions", roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N5_OPERATOR] },
  { href: "sewo", label: "S-EWO", roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY] },
  { href: "smat", label: "SMAT", roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR] },
  { href: "occupational-health", label: "occupationalHealth", roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY] },
  { href: "monthly-inputs", label: "monthlyInputs", roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY] },
  { href: "contractors", label: "contractors", roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR] },
  { href: "mapa", label: "mapa", roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N5_OPERATOR] },
  { href: "admin", label: "admin", roles: [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY] },
];
const CORPORATE_ROLES: RoleCode[] = [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY];
const MODULE_BY_ITEM: Partial<Record<(typeof items)[number]["href"], keyof typeof DEFAULT_MODULE_TOGGLES>> = {
  mapa: "MAPA",
  validation: "VALIDATIONS",
  actions: "ACTIONS",
  sewo: "SEWO",
  smat: "SMAT",
  "occupational-health": "OCCUPATIONAL_HEALTH",
  contractors: "CONTRACTORS",
  communications: "COMMUNICATIONS",
  "monthly-inputs": "MONTHLY_INPUTS",
  "environment-dashboard": "MONTHLY_INPUTS",
};

export default async function PlantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ plant: string }>;
}) {
  const session = await getServerSession(authOptions);
  const locale = await getLocale();
  const ui = getUiDictionary(locale);
  if (!session?.user) redirect("/login");

  const { plant } = await params;

  const hasPlantAccess = session.user.plantRoles.some(
    (entry) => entry.plantCode === plant || entry.role === "N0_ADMIN" || entry.role === "N1_CORPORATE",
  );
  if (!hasPlantAccess) {
    redirect("/app/corporate");
  }

  const plantRole = session.user.plantRoles.some((entry) => entry.role === RoleCode.N0_ADMIN)
    ? RoleCode.N0_ADMIN
    : session.user.plantRoles.some((entry) => entry.role === RoleCode.N1_CORPORATE)
      ? RoleCode.N1_CORPORATE
      : session.user.plantRoles.find((entry) => entry.plantCode === plant)?.role;
  const [plantRecord, globalModuleParameter] = await prisma.$transaction([
    prisma.plant.findUnique({
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
  const unreadRepeatabilityAlerts = plantRecord
    ? await prisma.notification.findMany({
        where: {
          userId: session.user.id,
          plantId: plantRecord.id,
          channel: "REPEATABILITY_ALERT",
          status: "UNREAD",
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 10,
      })
    : [];
  const moduleToggles: Record<keyof typeof DEFAULT_MODULE_TOGGLES, boolean> = {
    ...DEFAULT_MODULE_TOGGLES,
    ...((globalModuleParameter?.valueJson as Record<string, boolean> | null) ?? {}),
    ...((plantRecord?.systemParameters[0]?.valueJson as Record<string, boolean> | null) ?? {}),
  };

  return (
    <>
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-6 py-6 md:grid-cols-[240px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Plant {plant.toUpperCase()}</p>
          <nav className="space-y-2">
            {items
              .filter((item) => (plantRole ? item.roles.includes(plantRole) : false))
              .filter((item) => {
                const moduleKey = MODULE_BY_ITEM[item.href];
                return moduleKey ? Boolean(moduleToggles[moduleKey]) : true;
              })
              .map((item) => (
                <Link
                  key={item.href}
                  href={`/app/${plant}/${item.href}`}
                  className={`block rounded-md px-3 py-2 text-sm ${
                    item.spotlight
                      ? "border border-amber-200 bg-amber-50 font-semibold text-amber-900 hover:bg-amber-100"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {ui.modules[item.label as keyof typeof ui.modules] ?? item.label}
                </Link>
              ))}
            {plantRole && CORPORATE_ROLES.includes(plantRole) ? (
              <>
                <Link href="/app/corporate" className="block rounded-md px-3 py-2 text-sm text-teal-700 hover:bg-teal-50">
                  {ui.modules.corporate}
                </Link>
                {plantRole === RoleCode.N0_ADMIN ? (
                  <Link href="/app/settings" className="block rounded-md px-3 py-2 text-sm text-teal-700 hover:bg-teal-50">
                    {ui.modules.settings}
                  </Link>
                ) : null}
              </>
            ) : null}
          </nav>
        </aside>

        <section className="space-y-5">{children}</section>
      </div>

      <RepeatabilityAlertModal
        plantCode={plant}
        alerts={unreadRepeatabilityAlerts.map((alert) => ({
          id: alert.id,
          title: alert.title,
          body: alert.body,
          createdAt: alert.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
