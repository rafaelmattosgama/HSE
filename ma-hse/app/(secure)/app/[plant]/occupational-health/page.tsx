import { notFound } from "next/navigation";
import { OccupationalHealthManager } from "@/components/feature/occupational-health-manager";
import { prisma } from "@/lib/prisma";
import { OccupationalHealthService, type OccupationalHealthWorkerView } from "@/lib/services/occupational-health-service";

export default async function OccupationalHealthPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
  const { plant } = await params;
  const plantRow = await prisma.plant.findUnique({ where: { code: plant } });
  if (!plantRow) notFound();

  const [workers, workstations] = await Promise.all([
    OccupationalHealthService.list(plantRow.id),
    prisma.workstation.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <OccupationalHealthManager
      plant={plant}
      initialWorkers={workers as OccupationalHealthWorkerView[]}
      workstations={workstations}
    />
  );
}
