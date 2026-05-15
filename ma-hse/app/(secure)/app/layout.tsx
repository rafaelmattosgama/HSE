import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { RoleCode } from "@prisma/client";
import { MaSymbol } from "@/components/branding/ma-symbol";
import { SewoApprovalFloatingAlert } from "@/components/feature/sewo-approval-floating-alert";
import { LogoutButton } from "@/components/layout/logout-button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UiLanguageRuntime } from "@/components/layout/ui-language-runtime";
import { authOptions } from "@/lib/auth/options";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { getUiDictionary } from "@/lib/ui-language";

export default async function SecureAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/change-password");
  }

  const homeHref = session.user.plantRoles.some((entry) => entry.role === "N0_ADMIN") ? "/app/settings" : "/app/corporate";
  const uiLocale = await getServerUiLocale({ userLanguage: session.user.language });
  const ui = getUiDictionary(uiLocale);
  const hasN1Validation = session.user.plantRoles.some(
    (entry) => entry.role === RoleCode.N0_ADMIN || entry.role === RoleCode.N1_CORPORATE,
  );

  return (
    <div className="app-shell">
      <UiLanguageRuntime locale={uiLocale} />
      <header className="app-topbar">
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
            <ThemeToggle />
            <div data-no-translate className="app-toolbar">{session.user.name}</div>
            <LogoutButton />
          </div>
        </div>
      </header>
      <SewoApprovalFloatingAlert enabled={hasN1Validation} />
      <div className="app-content">{children}</div>
    </div>
  );
}
