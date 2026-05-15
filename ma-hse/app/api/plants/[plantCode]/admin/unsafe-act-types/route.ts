import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { ensureDefaultUnsafeActTypes } from "@/lib/services/unsafe-act-type-service";
import { deleteUnsafeActTypeInput, upsertUnsafeActTypeInput } from "@/lib/validation/dtos";

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  await ensureDefaultUnsafeActTypes(plant.id);

  const types = await prisma.unsafeActType.findMany({
    where: { plantId: plant.id, isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }],
  });

  return ok({ types });
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, upsertUnsafeActTypeInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const code = parsed.data.code.trim();
  const category = parsed.data.category.trim();
  const name = parsed.data.name.trim();

  const existing = parsed.data.id
    ? await prisma.unsafeActType.findFirst({
        where: {
          id: parsed.data.id,
          plantId: plant.id,
        },
        select: {
          id: true,
        },
      })
    : null;

  if (parsed.data.id && !existing) {
    return fail("NOT_FOUND", "Unsafe act type not found for plant scope", 404);
  }

  const type = existing
    ? await prisma.unsafeActType.update({
        where: { id: existing.id },
        data: {
          code,
          category,
          name,
          isActive: true,
        },
      })
    : await prisma.unsafeActType.upsert({
        where: {
          plantId_code: {
            plantId: plant.id,
            code,
          },
        },
        update: {
          category,
          name,
          isActive: true,
        },
        create: {
          plantId: plant.id,
          code,
          category,
          name,
        },
      });

  return ok({ type }, { status: 201 });
}

export async function DELETE(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, deleteUnsafeActTypeInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const result = await prisma.unsafeActType.updateMany({
    where: {
      id: parsed.data.id,
      plantId: plant.id,
    },
    data: {
      isActive: false,
    },
  });

  if (result.count === 0) {
    return fail("NOT_FOUND", "Unsafe act type not found for plant scope", 404);
  }

  return ok({ deletedId: parsed.data.id });
}
