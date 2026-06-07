import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { ProfileAlertsPanel } from "@/components/feature/profile-alerts-panel";
import { authOptions } from "@/lib/auth/options";
import { ProfileAlertService } from "@/lib/services/profile-alert-service";

export default async function ProfileAlertsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  if (!ProfileAlertService.canUseAlerts(session.user)) {
    redirect("/app/profile");
  }

  const primaryPlantCode = session.user.plantRoles.find((entry) => entry.plantCode)?.plantCode;
  const homeHref = primaryPlantCode
    ? `/app/${primaryPlantCode}/dashboards`
    : session.user.plantRoles.some((entry) => entry.role === "N0_ADMIN")
      ? "/app/settings"
      : "/app/corporate";

  const [alerts, unreadCount] = await Promise.all([
    ProfileAlertService.listForUser(session.user),
    ProfileAlertService.countUnreadForUser(session.user),
  ]);
  const scopeLabel = ProfileAlertService.getScopeLabel(session.user);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-6">
      <div className="mb-5">
        <Link href={homeHref} className="app-toolbar inline-flex items-center gap-2">
          <span aria-hidden="true">&larr;</span>
          <span>Voltar ao ecra principal</span>
        </Link>
      </div>
      <ProfileAlertsPanel initialAlerts={alerts} initialUnreadCount={unreadCount} scopeLabel={scopeLabel} />
    </main>
  );
}
