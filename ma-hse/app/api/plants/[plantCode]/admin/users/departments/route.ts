import { MasterDataEntityType, RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { localizeMasterDataRows } from "@/lib/services/master-data-translation-service";

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const departments = await prisma.area.findMany({
    where: { plantId: plant.id, isActive: true },
    select: { id: true, code: true, name: true, sourceLanguage: true },
    orderBy: { name: "asc" },
  });
  const localized = await localizeMasterDataRows(MasterDataEntityType.AREA, departments, await getServerUiLocale());
  return ok({ departments: localized.map(({ id, code, name }) => ({ id, code, name })) });
}
