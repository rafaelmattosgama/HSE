import { RoleCode } from "@prisma/client";
import { ValidationQueue } from "@/components/feature/validation-queue";
import { SewoValidationQueue } from "@/components/feature/sewo-validation-queue";
import { AppHero, AppSectionHeader } from "@/components/ui/app-surface";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { getLocalizedCommunicationUi } from "@/lib/services/communication-ui-localization";
import { getLocalizedSewoUi } from "@/lib/services/sewo-ui-localization";
import { getPendingSewoValidationRows } from "@/lib/services/sewo-validation-service";
import { translateForViewer } from "@/lib/services/viewer-translation-service";
import { getUiDictionary } from "@/lib/ui-language";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

export default async function ValidationPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
  const { plant } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const canUseValidation = session.user.plantRoles.some((entry) => entry.role === RoleCode.N1_CORPORATE);
  if (!canUseValidation) redirect("/app/corporate");

  const plantRow = await prisma.plant.findUniqueOrThrow({ where: { code: plant } });
  const uiLocale = await getServerUiLocale({
    userLanguage: session?.user.language,
    plantLanguage: plantRow.defaultLanguage,
  });
  const ui = getUiDictionary(uiLocale);

  const pending = await prisma.communication.findMany({
    where: {
      plantId: plantRow.id,
      status: {
        in: ["SUBMITTED", "PENDING_VALIDATION"],
      },
    },
    include: {
      area: true,
      workstation: true,
    },
    orderBy: [
      { eventDatetime: "asc" },
      { reportedAt: "asc" },
    ],
    take: 100,
  });
  const [translatedDescriptions, communicationUi, sewoUiResult, pendingSewoRows] = await Promise.all([
    translateForViewer(uiLocale, pending.map((row) => row.description)),
    getLocalizedCommunicationUi(uiLocale),
    getLocalizedSewoUi(uiLocale),
    getPendingSewoValidationRows({
      userId: session.user.id,
      plantCode: plant,
    }),
  ]);

  return (
    <>
      <AppHero
        eyebrow={ui.modules.validation}
        title={ui.modules.validation}
        description={sewoUiResult.ui.n1ValidationSubtitle}
      />

      <section className="space-y-4">
        <AppSectionHeader title={sewoUiResult.ui.n1ValidationSewoSection} />
        <SewoValidationQueue rows={pendingSewoRows} ui={sewoUiResult.ui} showPlant={false} />
      </section>

      <section className="space-y-4">
        <AppSectionHeader title={sewoUiResult.ui.n1ValidationCommunicationSection} />
        <ValidationQueue
          plant={plant}
          rows={pending.map((row, index) => ({
            id: row.id,
            type: row.type,
            typeLabel: communicationUi.communicationTypeLabels[row.type] ?? row.type,
            reporterName: row.reporterName,
            eventDatetime: row.eventDatetime.toISOString(),
            department: row.area?.name ?? "-",
            location: row.workstation?.name ?? "-",
            description: translatedDescriptions[index] ?? row.description,
          }))}
          labels={communicationUi.validationQueue}
          actionLabels={communicationUi.validationActions}
        />
      </section>
    </>
  );
}
