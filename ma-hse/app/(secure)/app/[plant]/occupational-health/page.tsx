import { MasterDataEntityType } from "@prisma/client";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { OccupationalHealthManager } from "@/components/feature/occupational-health-manager";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/prisma";
import { getServerUiDictionary, getServerUiLocale } from "@/lib/server-ui-language";
import { localizeMasterDataRows } from "@/lib/services/master-data-translation-service";
import { OccupationalHealthService, type OccupationalHealthWorkerView } from "@/lib/services/occupational-health-service";

export default async function OccupationalHealthPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
  const { plant } = await params;
  const session = await getServerSession(authOptions);
  const plantRow = await prisma.plant.findUnique({ where: { code: plant } });
  if (!plantRow) notFound();
  const ui = await getServerUiDictionary({
    userLanguage: session?.user.language,
    plantLanguage: plantRow.defaultLanguage,
  });
  const uiLocale = await getServerUiLocale({
    userLanguage: session?.user.language,
    plantLanguage: plantRow.defaultLanguage,
  });

  const [workers, workstations, adminWorkers] = await Promise.all([
    OccupationalHealthService.list(plantRow.id, uiLocale),
    prisma.workstation.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sourceLanguage: true },
    }),
    prisma.employeeDirectory.findMany({
      where: { plantId: plantRow.id },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: { id: true, employeeNo: true, name: true, isActive: true },
    }),
  ]);
  const localizedWorkstations = await localizeMasterDataRows(
    MasterDataEntityType.WORKSTATION,
    workstations,
    uiLocale,
  );
  const localizedWorkstationById = new Map(localizedWorkstations.map((row) => [row.id, row.name]));

  return (
    <OccupationalHealthManager
      plant={plant}
      title={ui.modules.occupationalHealth}
      initialWorkers={workers.map((worker) => ({
        ...worker,
        workstationName: worker.workstationId
          ? localizedWorkstationById.get(worker.workstationId) ?? worker.workstationName
          : worker.workstationName,
      })) as OccupationalHealthWorkerView[]}
      workstations={localizedWorkstations}
      adminWorkers={adminWorkers}
      locale={uiLocale}
    />
  );
}
