import { RoleCode } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { AppHero, AppSectionHeader } from "@/components/ui/app-surface";
import { SewoValidationQueue } from "@/components/feature/sewo-validation-queue";
import { authOptions } from "@/lib/auth/options";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { getLocalizedSewoUi } from "@/lib/services/sewo-ui-localization";
import { getPendingSewoValidationRows } from "@/lib/services/sewo-validation-service";

export default async function GlobalValidationPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const canUseValidation = session.user.plantRoles.some(
    (entry) => entry.role === RoleCode.N0_ADMIN || entry.role === RoleCode.N1_CORPORATE,
  );
  if (!canUseValidation) redirect("/app/corporate");

  const uiLocale = await getServerUiLocale({ userLanguage: session.user.language });
  const [{ ui }, rows] = await Promise.all([
    getLocalizedSewoUi(uiLocale),
    getPendingSewoValidationRows({
      userId: session.user.id,
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-6 py-6">
      <AppHero
        eyebrow={ui.n1ValidationSewoSection}
        title={ui.n1ValidationTitle}
        description={ui.n1ValidationSubtitle}
        actions={<span className="app-chip">{rows.length.toLocaleString()} {ui.pendingResult}</span>}
      />

      <section className="space-y-4">
        <AppSectionHeader title={ui.n1ValidationSewoSection} />
        <SewoValidationQueue rows={rows} ui={ui} showPlant />
      </section>
    </div>
  );
}
