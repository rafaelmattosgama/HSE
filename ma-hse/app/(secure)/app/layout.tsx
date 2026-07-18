import Link from "next/link";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RoleCode } from "@prisma/client";
import { MaSymbol } from "@/components/branding/ma-symbol";
import { ActionFloatingAlert } from "@/components/feature/action-floating-alert";
import { SewoApprovalFloatingAlert } from "@/components/feature/sewo-approval-floating-alert";
import { ProfileAlertsButton } from "@/components/layout/profile-alerts-button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UiLanguageRuntime } from "@/components/layout/ui-language-runtime";
import { UserMenu } from "@/components/layout/user-menu";
import { ONBOARDING_PERMISSIONS } from "@/components/onboarding/onboarding-config";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
import { canUseAgent } from "@/lib/agent/permissions";
import { authOptions } from "@/lib/auth/options";
import { env } from "@/lib/env";
import { ALL_PLANTS_SCOPE, LAST_PLANT_COOKIE } from "@/lib/plant-scope";
import { prisma } from "@/lib/prisma";
import { ProfileAlertService } from "@/lib/services/profile-alert-service";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { parseTheme, THEME_STORAGE_KEY } from "@/lib/theme";
import { getUiDictionary } from "@/lib/ui-language";

export default async function SecureAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const cookieStore = await cookies();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/change-password");
  }

  const availablePlantCodes = session.user.plantRoles.map((entry) => entry.plantCode).filter((code): code is string => Boolean(code));
  const lastPlant = cookieStore.get(LAST_PLANT_COOKIE)?.value;
  const primaryPlantCode =
    lastPlant && availablePlantCodes.includes(lastPlant)
      ? lastPlant
      : session.user.plantRoles.find((entry) => entry.plantCode)?.plantCode;
  const hasN0Role = session.user.plantRoles.some((entry) => entry.role === RoleCode.N0_ADMIN);
  const hasN1Role = session.user.plantRoles.some((entry) => entry.role === RoleCode.N1_CORPORATE);
  const fallbackGlobalPlant = !primaryPlantCode && (hasN0Role || hasN1Role)
    ? await prisma.plant.findFirst({
        where: { isActive: true },
        orderBy: { code: "asc" },
        select: { code: true },
      })
    : null;
  const onboardingPlantCode = primaryPlantCode ?? fallbackGlobalPlant?.code ?? null;
  const onboardingRole = hasN0Role
    ? RoleCode.N0_ADMIN
    : hasN1Role
      ? RoleCode.N1_CORPORATE
      : session.user.plantRoles.find((entry) => entry.plantCode === onboardingPlantCode)?.role
        ?? session.user.plantRoles[0]?.role;
  const homeHref = lastPlant === ALL_PLANTS_SCOPE && availablePlantCodes.length > 1
    ? "/app/all/communications"
    : primaryPlantCode
    ? `/app/${primaryPlantCode}/dashboards`
    : session.user.plantRoles.some((entry) => entry.role === "N0_ADMIN")
      ? "/app/settings"
      : "/app/corporate";
  const uiLocale = await getServerUiLocale({ userLanguage: session.user.language });
  const ui = getUiDictionary(uiLocale);
  const theme = parseTheme(cookieStore.get(THEME_STORAGE_KEY)?.value);
  const hasN1Validation = hasN1Role;
  const hasProfileAlerts = ProfileAlertService.canUseAlerts(session.user);
  const profileAlertScopeLabel = ProfileAlertService.getScopeLabel(session.user);
  const unreadProfileAlertCount = hasProfileAlerts ? await ProfileAlertService.countUnreadForUser(session.user) : 0;
  const onboardingPermissions = [
    ...(onboardingPlantCode ? [ONBOARDING_PERMISSIONS.PLANT_CONTEXT] : []),
    ...(hasProfileAlerts ? [ONBOARDING_PERMISSIONS.PROFILE_ALERTS] : []),
    ...(env.AGENT_ENABLED && canUseAgent({ role: onboardingRole }) ? [ONBOARDING_PERMISSIONS.AI_ASSISTANT] : []),
  ];

  const appShell = (
    <div className="app-shell">
      <UiLanguageRuntime locale={uiLocale} />
      <header className="app-topbar" data-onboarding="topbar">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4">
          <Link href={homeHref} className="flex items-center gap-3 text-[var(--brand-700)]">
            <div className="app-panel flex h-14 w-20 items-center justify-center rounded-2xl px-2 py-1">
              <MaSymbol className="h-auto w-full text-[var(--brand-700)]" title="MA" />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Integrated Safety Platform</span>
              <span data-no-translate className="text-xl font-bold leading-tight text-[var(--brand-700)]">MAx Safety</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            {hasN1Validation ? (
              <Link href="/app/validation" className="app-toolbar">
                {ui.modules.validation}
              </Link>
            ) : null}
            <ThemeToggle initialTheme={theme} />
            {hasProfileAlerts ? (
              <ProfileAlertsButton
                initialUnreadCount={unreadProfileAlertCount}
                scopeLabel={profileAlertScopeLabel}
              />
            ) : null}
            <UserMenu userName={session.user.name ?? "User"} />
          </div>
        </div>
      </header>
      <ActionFloatingAlert enabled={true} />
      <SewoApprovalFloatingAlert enabled={hasN1Validation} />
      <div className="app-content">{children}</div>
    </div>
  );

  return onboardingRole ? (
    <OnboardingProvider
      userContext={{
        role: onboardingRole,
        plantCode: onboardingPlantCode,
        permissions: onboardingPermissions,
        locale: uiLocale,
      }}
    >
      {appShell}
    </OnboardingProvider>
  ) : appShell;
}
