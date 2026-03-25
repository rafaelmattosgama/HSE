import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);

  const [areas, lines, workstations, equipments, shifts, riskThemes, unsafeActTypes, unsafeCondTypes, nearMissTypes, bodyParts, injuryTypes] =
    await prisma.$transaction([
      prisma.area.findMany({ where: { plantId: plant.id } }),
      prisma.line.findMany({ where: { plantId: plant.id } }),
      prisma.workstation.findMany({ where: { plantId: plant.id } }),
      prisma.equipment.findMany({ where: { plantId: plant.id } }),
      prisma.shift.findMany({ where: { plantId: plant.id } }),
      prisma.riskTheme.findMany({ where: { plantId: plant.id } }),
      prisma.unsafeActType.findMany({ where: { plantId: plant.id } }),
      prisma.unsafeConditionType.findMany({ where: { plantId: plant.id } }),
      prisma.nearMissType.findMany({ where: { plantId: plant.id } }),
      prisma.bodyPart.findMany({ where: { plantId: plant.id } }),
      prisma.injuryType.findMany({ where: { plantId: plant.id } }),
    ]);

  return ok({
    areas,
    lines,
    workstations,
    equipments,
    shifts,
    riskThemes,
    unsafeActTypes,
    unsafeCondTypes,
    nearMissTypes,
    bodyParts,
    injuryTypes,
  });
}