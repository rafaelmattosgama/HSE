import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { DEFAULT_PROFESSIONAL_RISKS } from "@/lib/defaults/professional-risks";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";

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
          isActive: true,
        },
        create: {
          plantId: plant.id,
          code: risk.code,
          category: risk.category,
          name: risk.name,
        },
      }),
    ),
  );
  const risks = await prisma.riskTheme.findMany({
    where: {
      plantId: plant.id,
    },
    orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }],
  });

  return ok({
    risks,
    summary: {
      professionalRisks: syncedRisks.length,
    },
  });
}
