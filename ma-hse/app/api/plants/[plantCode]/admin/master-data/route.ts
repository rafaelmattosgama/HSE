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

const ADMIN_MASTER_DATA_ROLES = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
] as const;

type MasterDataType =
  | "area"
  | "workstation"
  | "equipment"
  | "nearMissType"
  | "unsafeActType"
  | "unsafeConditionType"
  | "injuryType";

function supportsCategory(type: MasterDataType) {
  return type === "unsafeActType" || type === "unsafeConditionType";
}

function duplicateMessage(type: MasterDataType) {
  switch (type) {
    case "area":
      return "A department with this code already exists for the selected plant.";
    case "workstation":
      return "A workstation with this code already exists for the selected plant.";
    case "equipment":
      return "Equipment with this code already exists for the selected plant.";
    case "nearMissType":
      return "A near miss type with this code already exists for the selected plant.";
    case "unsafeActType":
      return "An unsafe act type with this code already exists for the selected plant.";
    case "unsafeConditionType":
      return "An unsafe condition type with this code already exists for the selected plant.";
    case "injuryType":
      return "An injury type with this code already exists for the selected plant.";
  }
}

function notFoundMessage(type: MasterDataType) {
  switch (type) {
    case "area":
      return "Department not found for the selected plant.";
    case "workstation":
      return "Workstation not found for the selected plant.";
    case "equipment":
      return "Equipment not found for the selected plant.";
    case "nearMissType":
      return "Near miss type not found for the selected plant.";
    case "unsafeActType":
      return "Unsafe act type not found for the selected plant.";
    case "unsafeConditionType":
      return "Unsafe condition type not found for the selected plant.";
    case "injuryType":
      return "Injury type not found for the selected plant.";
  }
}

function buildData(type: MasterDataType, input: { code: string; name: string; category?: string }) {
  return {
    code: input.code,
    name: input.name,
    isActive: true,
    ...(supportsCategory(type) ? { category: input.category?.trim() || "General" } : {}),
  };
}

async function findById(type: MasterDataType, plantId: string, id: string) {
  switch (type) {
    case "area":
      return prisma.area.findFirst({ where: { id, plantId } });
    case "workstation":
      return prisma.workstation.findFirst({ where: { id, plantId } });
    case "equipment":
      return prisma.equipment.findFirst({ where: { id, plantId } });
    case "nearMissType":
      return prisma.nearMissType.findFirst({ where: { id, plantId } });
    case "unsafeActType":
      return prisma.unsafeActType.findFirst({ where: { id, plantId } });
    case "unsafeConditionType":
      return prisma.unsafeConditionType.findFirst({ where: { id, plantId } });
    case "injuryType":
      return prisma.injuryType.findFirst({ where: { id, plantId } });
  }
}

async function findByCode(type: MasterDataType, plantId: string, code: string, excludeId?: string) {
  const where = {
    plantId,
    code,
    ...(excludeId ? { id: { not: excludeId } } : {}),
  };

  switch (type) {
    case "area":
      return prisma.area.findFirst({ where });
    case "workstation":
      return prisma.workstation.findFirst({ where });
    case "equipment":
      return prisma.equipment.findFirst({ where });
    case "nearMissType":
      return prisma.nearMissType.findFirst({ where });
    case "unsafeActType":
      return prisma.unsafeActType.findFirst({ where });
    case "unsafeConditionType":
      return prisma.unsafeConditionType.findFirst({ where });
    case "injuryType":
      return prisma.injuryType.findFirst({ where });
  }
}

async function createItem(type: MasterDataType, plantId: string, data: ReturnType<typeof buildData>) {
  switch (type) {
    case "area":
      return prisma.area.create({ data: { plantId, ...data } });
    case "workstation":
      return prisma.workstation.create({ data: { plantId, ...data } });
    case "equipment":
      return prisma.equipment.create({ data: { plantId, ...data } });
    case "nearMissType":
      return prisma.nearMissType.create({ data: { plantId, ...data } });
    case "unsafeActType":
      return prisma.unsafeActType.create({ data: { plantId, ...data } });
    case "unsafeConditionType":
      return prisma.unsafeConditionType.create({ data: { plantId, ...data } });
    case "injuryType":
      return prisma.injuryType.create({ data: { plantId, ...data } });
  }
}

async function updateItem(type: MasterDataType, id: string, data: ReturnType<typeof buildData>) {
  switch (type) {
    case "area":
      return prisma.area.update({ where: { id }, data });
    case "workstation":
      return prisma.workstation.update({ where: { id }, data });
    case "equipment":
      return prisma.equipment.update({ where: { id }, data });
    case "nearMissType":
      return prisma.nearMissType.update({ where: { id }, data });
    case "unsafeActType":
      return prisma.unsafeActType.update({ where: { id }, data });
    case "unsafeConditionType":
      return prisma.unsafeConditionType.update({ where: { id }, data });
    case "injuryType":
      return prisma.injuryType.update({ where: { id }, data });
  }
}

async function deactivateItem(type: MasterDataType, plantId: string, id: string) {
  switch (type) {
    case "area":
      return prisma.area.updateMany({ where: { id, plantId }, data: { isActive: false } });
    case "workstation":
      return prisma.workstation.updateMany({ where: { id, plantId }, data: { isActive: false } });
    case "equipment":
      return prisma.equipment.updateMany({ where: { id, plantId }, data: { isActive: false } });
    case "nearMissType":
      return prisma.nearMissType.updateMany({ where: { id, plantId }, data: { isActive: false } });
    case "unsafeActType":
      return prisma.unsafeActType.updateMany({ where: { id, plantId }, data: { isActive: false } });
    case "unsafeConditionType":
      return prisma.unsafeConditionType.updateMany({ where: { id, plantId }, data: { isActive: false } });
    case "injuryType":
      return prisma.injuryType.updateMany({ where: { id, plantId }, data: { isActive: false } });
  }
}

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [...ADMIN_MASTER_DATA_ROLES]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  await ensureDefaultShifts(plant.id);
  await ensureDefaultNearMissTypes(plant.id);
  await ensureDefaultUnsafeActTypes(plant.id);
  await ensureDefaultUnsafeConditionTypes(plant.id);

  const [areas, lines, workstations, equipments, shifts, riskThemes, unsafeActTypes, unsafeCondTypes, nearMissTypes, bodyParts, injuryTypes] =
    await prisma.$transaction([
      prisma.area.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: [{ code: "asc" }, { name: "asc" }] }),
      prisma.line.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: [{ code: "asc" }, { name: "asc" }] }),
      prisma.workstation.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: [{ code: "asc" }, { name: "asc" }] }),
      prisma.equipment.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: [{ code: "asc" }, { name: "asc" }] }),
      prisma.shift.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: { code: "asc" } }),
      prisma.riskTheme.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }] }),
      prisma.unsafeActType.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }] }),
      prisma.unsafeConditionType.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }] }),
      prisma.nearMissType.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: [{ code: "asc" }, { name: "asc" }] }),
      prisma.bodyPart.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: [{ code: "asc" }, { name: "asc" }] }),
      prisma.injuryType.findMany({ where: { plantId: plant.id, isActive: true }, orderBy: [{ code: "asc" }, { name: "asc" }] }),
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
  const auth = await requirePlantAccess(plantCode, [...ADMIN_MASTER_DATA_ROLES]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, createMasterDataItemInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const type = parsed.data.type;
  const code = parsed.data.code.trim();
  const name = parsed.data.name.trim();
  const data = buildData(type, {
    code,
    name,
    category: parsed.data.category,
  });

  if (parsed.data.id) {
    const existing = await findById(type, plant.id, parsed.data.id);
    if (!existing) {
      return fail("NOT_FOUND", notFoundMessage(type), 404);
    }

    const duplicate = await findByCode(type, plant.id, code, parsed.data.id);
    if (duplicate) {
      return fail("DUPLICATE_CODE", duplicateMessage(type), 409);
    }

    const item = await updateItem(type, parsed.data.id, data);
    return ok({ item });
  }

  const duplicate = await findByCode(type, plant.id, code);
  if (duplicate?.isActive) {
    return fail("DUPLICATE_CODE", duplicateMessage(type), 409);
  }

  if (duplicate && !duplicate.isActive) {
    const item = await updateItem(type, duplicate.id, data);
    return ok({ item }, { status: 201 });
  }

  const item = await createItem(type, plant.id, data);
  return ok({ item }, { status: 201 });
}

export async function DELETE(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [...ADMIN_MASTER_DATA_ROLES]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, deleteMasterDataItemInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const result = await deactivateItem(parsed.data.type, plant.id, parsed.data.id);

  if (result.count === 0) {
    return fail("NOT_FOUND", notFoundMessage(parsed.data.type), 404);
  }

  return ok({ deletedId: parsed.data.id, type: parsed.data.type });
}
