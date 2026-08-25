import { RoleCode } from "@prisma/client";
import { notFound } from "next/navigation";
import { CompetenceWorkerProfile } from "@/components/feature/competence-worker-profile";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { getServerUiDictionary, getServerUiLocale } from "@/lib/server-ui-language";
import { CompetenceService } from "@/lib/services/competence-service";

const VIEW_ROLES: RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
  RoleCode.N5_OPERATOR,
];

export default async function CompetenceWorkerProfilePage({
  params,
}: {
  params: Promise<{ plant: string; workerId: string }>;
}) {
  const { plant, workerId } = await params;
  const auth = await requirePlantAccess(plant, VIEW_ROLES);
  if ("error" in auth) notFound();
  const { session } = auth;
  const role = "role" in auth ? auth.role : RoleCode.N5_OPERATOR;

  const plantRow = await prisma.plant.findUnique({ where: { code: plant } });
  if (!plantRow) notFound();

  const ui = await getServerUiDictionary({
    userLanguage: session.user.language,
    plantLanguage: plantRow.defaultLanguage,
  });
  const uiLocale = await getServerUiLocale({
    userLanguage: session.user.language,
    plantLanguage: plantRow.defaultLanguage,
  });

  const [profile, owners] = await Promise.all([
    CompetenceService.getWorkerProfile(plantRow.id, workerId, uiLocale, {
      role,
      userId: session.user.id,
    }),
    prisma.userPlantRole.findMany({
      where: { plantId: plantRow.id, user: { isActive: true } },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);
  if (!profile) notFound();

  const ownerOptions = Array.from(new Map(owners.map((entry) => [entry.user.id, entry.user])).values());

  return (
    <CompetenceWorkerProfile
      plant={plant}
      labels={ui.competences}
      viewerRole={role}
      profile={profile}
      owners={ownerOptions}
    />
  );
}
