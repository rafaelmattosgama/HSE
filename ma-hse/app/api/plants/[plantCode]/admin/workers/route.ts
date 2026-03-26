import { RoleCode } from "@prisma/client";
import { ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { createWorkerInput } from "@/lib/validation/dtos";

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const workers = await prisma.employeeDirectory.findMany({
    where: { plantId: plant.id },
    orderBy: { name: "asc" },
  });

  return ok({ workers });
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, createWorkerInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const worker = await prisma.employeeDirectory.upsert({
    where: {
      plantId_employeeNo: {
        plantId: plant.id,
        employeeNo: parsed.data.employeeNo.trim(),
      },
    },
    update: {
      name: parsed.data.name.trim(),
      dept: parsed.data.dept?.trim() || null,
      isActive: true,
    },
    create: {
      plantId: plant.id,
      employeeNo: parsed.data.employeeNo.trim(),
      name: parsed.data.name.trim(),
      dept: parsed.data.dept?.trim() || null,
      isActive: true,
    },
  });

  return ok({ worker }, { status: 201 });
}
