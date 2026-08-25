import { RoleCode } from "@prisma/client";
import { notFound } from "next/navigation";
import { FireEquipmentList } from "@/components/feature/fire-equipment-list";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { getServerUiDictionary } from "@/lib/server-ui-language";
import { FireEquipmentService } from "@/lib/services/fire-equipment-service";

const VIEW_ROLES: RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
  RoleCode.N5_OPERATOR,
];

export default async function FireEquipmentPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
  const { plant } = await params;
  const auth = await requirePlantAccess(plant, VIEW_ROLES);
  if ("error" in auth) notFound();
  const { session } = auth;

  const plantRow = await prisma.plant.findUnique({ where: { code: plant } });
  if (!plantRow) notFound();

  const ui = await getServerUiDictionary({
    userLanguage: session.user.language,
    plantLanguage: plantRow.defaultLanguage,
  });

  const [view, areas, workstations, ownerRows] = await Promise.all([
    FireEquipmentService.list(plantRow.id),
    prisma.area.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.workstation.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.userPlantRole.findMany({
      where: { plantId: plantRow.id, user: { isActive: true } },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  const owners = Array.from(new Map(ownerRows.map((entry) => [entry.user.id, entry.user])).values());

  return (
    <FireEquipmentList
      plant={plant}
      title={ui.modules.fireEquipment}
      labels={ui.fireEquipment}
      types={view.types}
      equipment={view.equipment}
      kpis={view.kpis}
      areas={areas}
      workstations={workstations}
      owners={owners}
    />
  );
}
