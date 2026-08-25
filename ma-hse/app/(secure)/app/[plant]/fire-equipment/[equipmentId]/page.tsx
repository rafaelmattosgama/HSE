import { RoleCode } from "@prisma/client";
import { notFound } from "next/navigation";
import { FireEquipmentProfile } from "@/components/feature/fire-equipment-profile";
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

export default async function FireEquipmentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ plant: string; equipmentId: string }>;
  searchParams: Promise<{ fromTag?: string }>;
}) {
  const { plant, equipmentId } = await params;
  const { fromTag } = await searchParams;
  const auth = await requirePlantAccess(plant, VIEW_ROLES);
  if ("error" in auth) notFound();
  const { session } = auth;

  const plantRow = await prisma.plant.findUnique({ where: { code: plant } });
  if (!plantRow) notFound();

  const ui = await getServerUiDictionary({
    userLanguage: session.user.language,
    plantLanguage: plantRow.defaultLanguage,
  });

  const [profile, ownerRows] = await Promise.all([
    FireEquipmentService.getProfile(plantRow.id, equipmentId),
    prisma.userPlantRole.findMany({
      where: { plantId: plantRow.id, user: { isActive: true } },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);
  if (!profile) notFound();

  const owners = Array.from(new Map(ownerRows.map((entry) => [entry.user.id, entry.user])).values());

  return (
    <FireEquipmentProfile
      plant={plant}
      labels={ui.fireEquipment}
      profile={profile}
      owners={owners}
      autoOpenExecutionForm={fromTag === "1"}
    />
  );
}
