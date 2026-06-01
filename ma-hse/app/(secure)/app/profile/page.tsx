import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UserSettingsPanel } from "@/components/feature/user-settings-panel";
import { authOptions } from "@/lib/auth/options";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const primaryPlantCode = session.user.plantRoles.find((entry) => entry.plantCode)?.plantCode;
  const homeHref = primaryPlantCode
    ? `/app/${primaryPlantCode}/dashboards`
    : session.user.plantRoles.some((entry) => entry.role === "N0_ADMIN")
      ? "/app/settings"
      : "/app/corporate";

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-6">
      <div className="mb-5">
        <Link href={homeHref} className="app-toolbar inline-flex items-center gap-2">
          <span aria-hidden="true">←</span>
          <span>Voltar ao ecrã principal</span>
        </Link>
      </div>
      <UserSettingsPanel
        initialName={session.user.name ?? ""}
        initialLanguage={session.user.language}
      />
    </main>
  );
}
