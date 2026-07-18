import { MasterDataEntityType, RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import {
  localizeMasterDataRows,
  scheduleMasterDataTranslations,
} from "@/lib/services/master-data-translation-service";
import { deleteProfessionalRiskInput, upsertProfessionalRiskInput } from "@/lib/validation/dtos";

const MANAGE_ROLES = [RoleCode.N0_ADMIN];

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, MANAGE_ROLES);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
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
  return ok({ risks: localizedRisks });
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, MANAGE_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, upsertProfessionalRiskInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const code = parsed.data.code.trim();
  const name = parsed.data.name.trim();
  const category = parsed.data.category.trim();
  const sourceLanguage = auth.session.user.language;

  if (parsed.data.id) {
    const existing = await prisma.riskTheme.findFirst({
      where: {
        id: parsed.data.id,
        plantId: plant.id,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return fail("NOT_FOUND", "Professional risk not found for plant scope", 404);
    }

    const duplicate = await prisma.riskTheme.findFirst({
      where: {
        plantId: plant.id,
        code,
        id: {
          not: parsed.data.id,
        },
      },
      select: {
        id: true,
      },
    });

    if (duplicate) {
      return fail("DUPLICATE_CODE", "Another professional risk already uses this code", 409);
    }

    const risk = await prisma.riskTheme.update({
      where: {
        id: parsed.data.id,
      },
      data: {
        code,
        category,
        name,
        sourceLanguage,
        categorySourceLanguage: sourceLanguage,
        isActive: true,
      },
    });

    await scheduleMasterDataTranslations({
      entityType: MasterDataEntityType.RISK_THEME,
      entityId: risk.id,
    });
    return ok({ risk });
  }

  const risk = await prisma.riskTheme.upsert({
    where: {
      plantId_code: {
        plantId: plant.id,
        code,
      },
    },
    update: {
      category,
      name,
      sourceLanguage,
      categorySourceLanguage: sourceLanguage,
      isActive: true,
    },
    create: {
      plantId: plant.id,
      code,
      category,
      name,
      sourceLanguage,
      categorySourceLanguage: sourceLanguage,
    },
  });

  await scheduleMasterDataTranslations({
    entityType: MasterDataEntityType.RISK_THEME,
    entityId: risk.id,
  });
  return ok({ risk }, { status: 201 });
}

export async function DELETE(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, MANAGE_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, deleteProfessionalRiskInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const result = await prisma.riskTheme.updateMany({
    where: {
      id: parsed.data.id,
      plantId: plant.id,
    },
    data: {
      isActive: false,
    },
  });

  if (result.count === 0) {
    return fail("NOT_FOUND", "Professional risk not found for plant scope", 404);
  }

  return ok({ deletedId: parsed.data.id });
}
