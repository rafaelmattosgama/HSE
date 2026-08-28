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
  if (parsed.data.hardDelete) {
    const worker = await prisma.employeeDirectory.findFirst({
      where: { id: parsed.data.id!, plantId: plant.id },
      select: { id: true },
    });
    if (!worker) return fail("NOT_FOUND", "Worker not found for plant scope", 404);

    // Permanent deletion is intentionally conservative. Worker records are
    // referenced by clinical history, competences and safety records; those
    // must be retained, so the Admin can only delete an unused directory row.
    const [users, communications, involved, competenceWorkers, healthWorkers, sponsoredCompanies] = await Promise.all([
      prisma.user.count({ where: { employeeDirectoryId: worker.id } }),
      prisma.communication.count({ where: { targetEmployeeId: worker.id } }),
      prisma.communicationInvolvedEmployee.count({ where: { employeeId: worker.id } }),
      prisma.competenceWorker.count({ where: { employeeDirectoryId: worker.id } }),
      prisma.occupationalHealthWorker.count({ where: { employeeDirectoryId: worker.id } }),
      prisma.externalCompany.count({ where: { sponsorEmployeeId: worker.id } }),
    ]);
    if (users + communications + involved + competenceWorkers + healthWorkers + sponsoredCompanies > 0) {
      return fail("WORKER_HAS_HISTORY", "Worker cannot be permanently deleted because linked history exists. Inactivate the worker instead.", 409);
    }

    try {
      await prisma.employeeDirectory.delete({ where: { id: worker.id } });
      return ok({ deletedWorkerId: worker.id, permanentlyDeleted: true });
    } catch {
      return fail("WORKER_HAS_HISTORY", "Worker cannot be permanently deleted because linked history exists. Inactivate the worker instead.", 409);
    }
  }

  const result = parsed.data.deleteAll
    ? await prisma.employeeDirectory.updateMany({
        where: { plantId: plant.id, isActive: true },
        data: { isActive: false },
      })
    : await prisma.employeeDirectory.updateMany({
        where: { id: parsed.data.id!, plantId: plant.id },
        data: { isActive: false },
      });

  if (parsed.data.deleteAll) {
    return ok({ deletedCount: result.count, deleteAll: true });
  }

  if (result.count === 0) {
    return fail("NOT_FOUND", "Worker not found for plant scope", 404);
  }

  return ok({ deletedWorkerId: parsed.data.id });
}
