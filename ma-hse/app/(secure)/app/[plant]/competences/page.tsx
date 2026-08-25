import { MasterDataEntityType, RoleCode } from "@prisma/client";
import { notFound } from "next/navigation";
import { CompetenceMatrixManager } from "@/components/feature/competence-matrix-manager";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { getServerUiDictionary, getServerUiLocale } from "@/lib/server-ui-language";
import { localizeMasterDataRows } from "@/lib/services/master-data-translation-service";
import { CompetenceService } from "@/lib/services/competence-service";

const VIEW_ROLES: RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
  RoleCode.N5_OPERATOR,
];

export default async function CompetencesPage({
  params,
}: {
  params: Promise<{ plant: string }>;
}) {
  const { plant } = await params;
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

  const [matrix, employees, areas, ownerRoles] = await Promise.all([
    CompetenceService.list(plantRow.id, uiLocale, { role, userId: session.user.id }),
    prisma.employeeDirectory.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, employeeNo: true, name: true, dept: true },
    }),
    prisma.area.findMany({
      where: { plantId: plantRow.id, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sourceLanguage: true },
    }),
    prisma.userPlantRole.findMany({
      where: { plantId: plantRow.id, user: { isActive: true } },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  const localizedAreas = await localizeMasterDataRows(MasterDataEntityType.AREA, areas, uiLocale);
  const owners = Array.from(new Map(ownerRoles.map((entry) => [entry.user.id, entry.user])).values());

  return (
    <CompetenceMatrixManager
      plant={plant}
      title={ui.modules.competences}
      labels={ui.competences}
      matrix={matrix}
      employees={employees}
      areas={localizedAreas.map((area) => ({ id: area.id, name: area.name }))}
      owners={owners}
      viewerRole={role}
    />
  );
}
