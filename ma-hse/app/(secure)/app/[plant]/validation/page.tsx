import { RoleCode } from "@prisma/client";
import { ValidationQueue } from "@/components/feature/validation-queue";
import { SewoValidationQueue } from "@/components/feature/sewo-validation-queue";
import { AppHero, AppSectionHeader } from "@/components/ui/app-surface";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { isAllPlantsScope } from "@/lib/plant-scope";
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

  const canUseValidation = session.user.plantRoles.some((entry) => entry.role === RoleCode.N1_CORPORATE || entry.role === RoleCode.N3_SAFETY);
  if (!canUseValidation) redirect("/app/corporate");

  const isN1 = session.user.plantRoles.some((entry) => entry.role === RoleCode.N1_CORPORATE);
  const isAllPlants = isAllPlantsScope(plant);
  const hasGlobalPlantAccess = session.user.plantRoles.some((entry) => entry.role === RoleCode.N0_ADMIN || entry.role === RoleCode.N1_CORPORATE);
  const scopedPlantCodes = Array.from(
    new Set(
      session.user.plantRoles
        .filter((entry) => entry.role === RoleCode.N3_SAFETY)
        .map((entry) => entry.plantCode)
        .filter((code): code is string => Boolean(code)),
    ),
  );

  const plantRows = isAllPlants
    ? await prisma.plant.findMany({
        where: hasGlobalPlantAccess ? { isActive: true } : { code: { in: scopedPlantCodes }, isActive: true },
        orderBy: { code: "asc" },
      })
    : [await prisma.plant.findUniqueOrThrow({ where: { code: plant } })];
  if (isAllPlants && plantRows.length <= 1) {
    if (!plantRows[0]?.code && !scopedPlantCodes[0]) redirect("/app/corporate");
    redirect(`/app/${plantRows[0]?.code ?? scopedPlantCodes[0]}/validation`);
  }
  const uiLocale = await getServerUiLocale({
    userLanguage: session.user.language,
    plantLanguage: isAllPlants ? undefined : plantRows[0]?.defaultLanguage,
  });
  const ui = getUiDictionary(uiLocale);

  const pending = await prisma.communication.findMany({
    where: {
      plantId: { in: plantRows.map((row) => row.id) },
      status: {
        in: ["SUBMITTED", "PENDING_VALIDATION"],
      },
    },
    include: {
      plant: true,
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
    isN1 ? getPendingSewoValidationRows({ userId: session.user.id, plantCode: isAllPlants ? undefined : plant }) : [],
  ]);

  return (
    <>
      <AppHero
        eyebrow={ui.modules.validation}
        title={ui.modules.validation}
        description={sewoUiResult.ui.n1ValidationCommunicationSection}
      />

      {isN1 && (
        <section className="space-y-4">
          <AppSectionHeader title={sewoUiResult.ui.n1ValidationSewoSection} />
          <SewoValidationQueue rows={pendingSewoRows} ui={sewoUiResult.ui} showPlant={isAllPlants} />
        </section>
      )}

      <section className="space-y-4">
        <AppSectionHeader title={sewoUiResult.ui.n1ValidationCommunicationSection} />
        <ValidationQueue
          plant={plant}
          showPlant={isAllPlants}
          rows={pending.map((row, index) => ({
            id: row.id,
            plantCode: row.plant.code,
            plantName: row.plant.name,
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
