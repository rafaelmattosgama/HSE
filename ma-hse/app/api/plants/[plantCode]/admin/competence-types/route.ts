import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { deleteCompetenceTypeInput, upsertCompetenceTypeInput } from "@/lib/validation/dtos";

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const types = await prisma.competenceType.findMany({
    where: { plantId: plant.id, isActive: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });

  return ok({ types });
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, upsertCompetenceTypeInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const code = parsed.data.code.trim();
  const name = parsed.data.name.trim();

  const existing = parsed.data.id
    ? await prisma.competenceType.findFirst({
        where: { id: parsed.data.id, plantId: plant.id },
        select: { id: true },
      })
    : null;

  if (parsed.data.id && !existing) {
    return fail("NOT_FOUND", "Competence type not found for plant scope", 404);
  }

  const data = {
    code,
    name,
    category: parsed.data.category,
    requiresTraining: parsed.data.requiresTraining,
    requiresAssessment: parsed.data.requiresAssessment,
    requiresAuthorization: parsed.data.requiresAuthorization,
    validityMonths: parsed.data.validityMonths,
    refresherMonths: parsed.data.refresherMonths ?? null,
    legalReference: parsed.data.legalReference ?? null,
    displayOrder: parsed.data.displayOrder,
  };

  const type = existing
    ? await prisma.competenceType.update({
        where: { id: existing.id },
        data: { ...data, isActive: true },
      })
    : await prisma.competenceType.upsert({
        where: { plantId_code: { plantId: plant.id, code } },
        update: { ...data, isActive: true },
        create: { plantId: plant.id, ...data },
      });

  return ok({ type }, { status: 201 });
}

export async function DELETE(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, deleteCompetenceTypeInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const result = await prisma.competenceType.updateMany({
    where: { id: parsed.data.id, plantId: plant.id },
    data: { isActive: false },
  });

  if (result.count === 0) {
    return fail("NOT_FOUND", "Competence type not found for plant scope", 404);
  }

  return ok({ deletedId: parsed.data.id });
}
