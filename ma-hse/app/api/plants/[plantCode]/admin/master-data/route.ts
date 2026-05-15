import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { ensureDefaultNearMissTypes } from "@/lib/services/near-miss-type-service";
import { ensureDefaultShifts } from "@/lib/services/shift-service";
import { ensureDefaultUnsafeActTypes } from "@/lib/services/unsafe-act-type-service";
import { ensureDefaultUnsafeConditionTypes } from "@/lib/services/unsafe-condition-type-service";
import { createMasterDataItemInput, deleteMasterDataItemInput } from "@/lib/validation/dtos";

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  await ensureDefaultShifts(plant.id);
  await ensureDefaultNearMissTypes(plant.id);
  await ensureDefaultUnsafeActTypes(plant.id);
  await ensureDefaultUnsafeConditionTypes(plant.id);

  const [areas, lines, workstations, equipments, shifts, riskThemes, unsafeActTypes, unsafeCondTypes, nearMissTypes, bodyParts, injuryTypes] =
    await prisma.$transaction([
      prisma.area.findMany({ where: { plantId: plant.id, isActive: true } }),
      prisma.line.findMany({ where: { plantId: plant.id, isActive: true } }),
      prisma.workstation.findMany({ where: { plantId: plant.id, isActive: true } }),
      prisma.equipment.findMany({ where: { plantId: plant.id, isActive: true } }),
      prisma.shift.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: { code: "asc" } }),
      prisma.riskTheme.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }] }),
      prisma.unsafeActType.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }] }),
      prisma.unsafeConditionType.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }] }),
      prisma.nearMissType.findMany({ where: { plantId: plant.id, isActive: true } }),
      prisma.bodyPart.findMany({ where: { plantId: plant.id, isActive: true } }),
      prisma.injuryType.findMany({ where: { plantId: plant.id, isActive: true } }),
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

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, createMasterDataItemInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const code = parsed.data.code.trim();
  const name = parsed.data.name.trim();

  if (parsed.data.type === "area") {
    const area = await prisma.area.upsert({
      where: {
        plantId_code: {
          plantId: plant.id,
          code,
        },
      },
      update: {
        name,
        isActive: true,
      },
      create: {
        plantId: plant.id,
        code,
        name,
      },
    });

    return ok({ item: area }, { status: 201 });
  }

  const workstation = await prisma.workstation.upsert({
    where: {
      plantId_code: {
        plantId: plant.id,
        code,
      },
    },
    update: {
      name,
      isActive: true,
    },
    create: {
      plantId: plant.id,
      code,
      name,
    },
  });

  return ok({ item: workstation }, { status: 201 });
}

export async function DELETE(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, deleteMasterDataItemInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const result =
    parsed.data.type === "area"
      ? await prisma.area.updateMany({
          where: { id: parsed.data.id, plantId: plant.id },
          data: { isActive: false },
        })
      : await prisma.workstation.updateMany({
          where: { id: parsed.data.id, plantId: plant.id },
          data: { isActive: false },
        });

  if (result.count === 0) {
    return fail("NOT_FOUND", "Master data item not found for plant scope", 404);
  }

  return ok({ deletedId: parsed.data.id, type: parsed.data.type });
}
