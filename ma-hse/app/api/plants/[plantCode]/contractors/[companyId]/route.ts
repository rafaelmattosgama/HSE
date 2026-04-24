import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { prisma } from "@/lib/prisma";
import { contractorCompanyUpdateInput } from "@/lib/validation/dtos";

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string; companyId: string }> }) {
  const { plantCode, companyId } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N1_CORPORATE]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  await prisma.externalCompany.findFirstOrThrow({
    where: { id: companyId, plantId: plant.id },
    select: { id: true },
  });
  const company = await prisma.externalCompany.findFirstOrThrow({
    where: { id: companyId, plantId: plant.id },
    include: {
      documents: true,
      workers: {
        include: { documents: true },
      },
      sponsorUser: true,
    },
  });

  return ok(company);
}

export async function PATCH(request: Request, context: { params: Promise<{ plantCode: string; companyId: string }> }) {
  const { plantCode, companyId } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N3_SAFETY, RoleCode.N1_CORPORATE]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, contractorCompanyUpdateInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  await prisma.externalCompany.findFirstOrThrow({
    where: { id: companyId, plantId: plant.id },
    select: { id: true },
  });

  const company = await prisma.externalCompany.update({
    where: { id: companyId },
    data: {
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
      ...(parsed.data.sponsorUserId !== undefined ? { sponsorUserId: parsed.data.sponsorUserId } : {}),
    },
  });

  return ok(company);
}
