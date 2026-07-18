import { MasterDataEntityType } from "@prisma/client";
import { DEFAULT_PROFESSIONAL_RISKS } from "@/lib/defaults/professional-risks";
import { prisma } from "@/lib/prisma";
import { scheduleMasterDataTranslations } from "@/lib/services/master-data-translation-service";

export async function ensureDefaultProfessionalRisks(plantId: string) {
  const existingDefaults = await prisma.riskTheme.count({
    where: {
      plantId,
      code: {
        startsWith: "PR-",
      },
    },
  });

  if (existingDefaults > 0) {
    return;
  }

  const risks = await prisma.$transaction(
    DEFAULT_PROFESSIONAL_RISKS.map((risk) =>
      prisma.riskTheme.upsert({
        where: {
          plantId_code: {
            plantId,
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
          plantId,
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
    risks.map((risk) =>
      scheduleMasterDataTranslations({
        entityType: MasterDataEntityType.RISK_THEME,
        entityId: risk.id,
      }),
    ),
  );
}
