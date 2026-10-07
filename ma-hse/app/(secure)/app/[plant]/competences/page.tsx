import { MasterDataEntityType, RoleCode } from "@prisma/client";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { CompetenceMatrixManager } from "@/components/feature/competence-matrix-manager";
import { CompetenceIndicators } from "@/components/feature/competence-indicators";
import { PlantTrainingManager } from "@/components/feature/plant-training-manager";
import { TrainingIndicators } from "@/components/feature/training-indicators";
import { TrainingAreaNavigation } from "@/components/feature/training-area-navigation";
import { AppHero } from "@/components/ui/app-surface";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { getServerUiDictionary, getServerUiLocale } from "@/lib/server-ui-language";
import { localizeMasterDataRows } from "@/lib/services/master-data-translation-service";
import { CompetenceService } from "@/lib/services/competence-service";
import { PlantTrainingService } from "@/lib/services/plant-training-service";
import { TRAINING_REGISTER_ROLES } from "@/lib/rbac/plant-training";
import { getTrainingUi } from "@/lib/training-ui";

const VIEW_ROLES: RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
  RoleCode.N5_OPERATOR,
  RoleCode.N6_HR,
];

export default async function CompetencesPage({
  params,
  searchParams,
}: {
  params: Promise<{ plant: string }>;
  searchParams?: Promise<{ area?: string }>;
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

  const trainingUi = getTrainingUi(uiLocale);
  const selectedArea = (await searchParams)?.area;
  const area = selectedArea === "training" || selectedArea === "competences" ? selectedArea : "overview";
  const navigation = <TrainingAreaNavigation plant={plant} area={area} ui={trainingUi} />;
  const today = formatInTimeZone(new Date(), plantRow.timezone, "yyyy-MM-dd");
  const canRegister = TRAINING_REGISTER_ROLES.includes(role);

  if (area === "training") {
    const [training, workers] = await Promise.all([
      PlantTrainingService.list(plantRow.id, { role, userId: session.user.id }),
      canRegister ? prisma.employeeDirectory.findMany({ where: { plantId: plantRow.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, employeeNo: true } }) : Promise.resolve([]),
    ]);
    return <div className="min-w-0 space-y-5">{navigation}<PlantTrainingManager plant={plant} {...training} workers={workers} canRegister={canRegister} canAdmin={role === RoleCode.N1_CORPORATE || role === RoleCode.N3_SAFETY} personalRecords={role === RoleCode.N5_OPERATOR} today={today} locale={uiLocale} ui={trainingUi} /></div>;
  }

  if (area === "overview") {
    const [matrix, training] = await Promise.all([
      CompetenceService.list(plantRow.id, uiLocale, { role, userId: session.user.id }),
      PlantTrainingService.list(plantRow.id, { role, userId: session.user.id }),
    ]);
    return <div className="min-w-0 space-y-5">
      <AppHero title={trainingUi.module} />{navigation}
      <section className="space-y-3"><h2 className="text-lg font-bold">{trainingUi.training}</h2><TrainingIndicators rows={training.metricRows} workerCount={training.workerCount} year={Number(today.slice(0, 4))} locale={uiLocale} ui={trainingUi} /></section>
      <section className="space-y-3"><h2 className="text-lg font-bold">{trainingUi.competences}</h2><CompetenceIndicators matrix={matrix} labels={ui.competences} /></section>
    </div>;
  }

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
    <div className="min-w-0 space-y-5">{navigation}
    <CompetenceMatrixManager
      plant={plant}
      title={trainingUi.competences}
      labels={ui.competences}
      matrix={matrix}
      employees={employees}
      areas={localizedAreas.map((area) => ({ id: area.id, name: area.name }))}
      owners={owners}
      viewerRole={role}
    />
    </div>
  );
}
