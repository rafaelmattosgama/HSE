import { MasterDataEntityType, RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { DEFAULT_PROFESSIONAL_RISKS } from "@/lib/defaults/professional-risks";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { localizeMasterDataRows, scheduleMasterDataTranslations } from "@/lib/services/master-data-translation-service";

const MANAGE_ROLES = [RoleCode.N0_ADMIN];

export async function POST(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, MANAGE_ROLES);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const syncedRisks = await prisma.$transaction(
    DEFAULT_PROFESSIONAL_RISKS.map((risk) =>
      prisma.riskTheme.upsert({
        where: {
          plantId_code: {
            plantId: plant.id,
            code: risk.code,
          },
        },
        update: {
          category: risk.category,
          name: risk.name,
          sourceLanguage: "pt",
          categorySourceLanguage: "en",
          isActive: true,
        },
        create: {
          plantId: plant.id,
          code: risk.code,
          category: risk.category,
          name: risk.name,
          sourceLanguage: "pt",
          categorySourceLanguage: "en",
        },
      }),
    ),
  );
  await Promise.all(
    syncedRisks.map((risk) =>
      scheduleMasterDataTranslations({
        entityType: MasterDataEntityType.RISK_THEME,
        entityId: risk.id,
      }),
    ),
  );
  const risks = await prisma.riskTheme.findMany({
    where: {
      plantId: plant.id,
    },
    orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }],
  });
  const localizedRisks = await localizeMasterDataRows(
    MasterDataEntityType.RISK_THEME,
    risks,
    auth.session.user.language,
  );

  return ok({
    risks: localizedRisks,
    summary: {
      professionalRisks: syncedRisks.length,
    },
  });
}
