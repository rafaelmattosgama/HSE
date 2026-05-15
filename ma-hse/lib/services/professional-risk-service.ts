import { DEFAULT_PROFESSIONAL_RISKS } from "@/lib/defaults/professional-risks";
import { prisma } from "@/lib/prisma";

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

  await prisma.$transaction(
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
          isActive: true,
        },
        create: {
          plantId,
          code: risk.code,
          category: risk.category,
          name: risk.name,
        },
      }),
    ),
  );
}
