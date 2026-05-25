import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { createWorkerInput, deleteWorkerInput } from "@/lib/validation/dtos";

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const workers = await prisma.employeeDirectory.findMany({
    where: { plantId: plant.id, isActive: true },
    orderBy: { name: "asc" },
  });

  return ok({ workers });
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, createWorkerInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const employeeNo = parsed.data.employeeNo.trim();
  const name = parsed.data.name.trim();
  const dept = parsed.data.dept?.trim() || null;

  if (parsed.data.id) {
    const existing = await prisma.employeeDirectory.findFirst({
      where: {
        id: parsed.data.id,
        plantId: plant.id,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return fail("NOT_FOUND", "Worker not found for the selected plant.", 404);
    }

    const duplicate = await prisma.employeeDirectory.findFirst({
      where: {
        plantId: plant.id,
        employeeNo,
        id: {
          not: existing.id,
        },
      },
      select: {
        id: true,
      },
    });

    if (duplicate) {
      return fail("DUPLICATE_EMPLOYEE_NO", "A worker with this employee number already exists for the selected plant.", 409);
    }

    const worker = await prisma.employeeDirectory.update({
      where: { id: existing.id },
      data: {
        employeeNo,
        name,
        dept,
        isActive: true,
      },
    });

    return ok({ worker });
  }

  const duplicate = await prisma.employeeDirectory.findFirst({
    where: {
      plantId: plant.id,
      employeeNo,
    },
  });

  if (duplicate?.isActive) {
    return fail("DUPLICATE_EMPLOYEE_NO", "A worker with this employee number already exists for the selected plant.", 409);
  }

  const worker = duplicate
    ? await prisma.employeeDirectory.update({
        where: { id: duplicate.id },
        data: {
          employeeNo,
          name,
          dept,
          isActive: true,
        },
      })
    : await prisma.employeeDirectory.create({
        data: {
          plantId: plant.id,
          employeeNo,
          name,
          dept,
          isActive: true,
        },
      });

  return ok({ worker }, { status: 201 });
}

export async function DELETE(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, deleteWorkerInput);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);
  const result = await prisma.employeeDirectory.updateMany({
    where: { id: parsed.data.id, plantId: plant.id },
    data: { isActive: false },
  });

  if (result.count === 0) {
    return fail("NOT_FOUND", "Worker not found for plant scope", 404);
  }

  return ok({ deletedWorkerId: parsed.data.id });
}
