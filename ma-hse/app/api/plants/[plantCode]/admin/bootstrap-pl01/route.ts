import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import {
  isPl01Code,
  PL01_INJURY_TYPES,
  PL01_WORKERS,
  PL01_WORKSTATIONS,
} from "@/lib/defaults/pl01-master-data";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";

export async function POST(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  if (!isPl01Code(plant.code)) {
    return fail("INVALID_INPUT", "This action is available only for PL01", 422);
  }

  await prisma.$transaction(async (tx) => {
    for (const [index, name] of PL01_WORKSTATIONS.entries()) {
      await tx.workstation.upsert({
        where: {
          plantId_code: {
            plantId: plant.id,
            code: `PL01-WS-${String(index + 1).padStart(3, "0")}`,
          },
        },
        update: {
          name,
          isActive: true,
        },
        create: {
          plantId: plant.id,
          code: `PL01-WS-${String(index + 1).padStart(3, "0")}`,
          name,
          isActive: true,
        },
      });
    }

    for (const worker of PL01_WORKERS) {
      const separatorIndex = worker.indexOf("-");
      const employeeNo = separatorIndex >= 0 ? worker.slice(0, separatorIndex).trim() : worker.trim();
      const name = separatorIndex >= 0 ? worker.slice(separatorIndex + 1).trim() : worker.trim();

      await tx.employeeDirectory.upsert({
        where: {
          plantId_employeeNo: {
            plantId: plant.id,
            employeeNo,
          },
        },
        update: {
          name,
          dept: null,
          isActive: true,
        },
        create: {
          plantId: plant.id,
          employeeNo,
          name,
          dept: null,
          isActive: true,
        },
      });
    }

    for (const [index, name] of PL01_INJURY_TYPES.entries()) {
      await tx.injuryType.upsert({
        where: {
          plantId_code: {
            plantId: plant.id,
            code: `PL01-IT-${String(index + 1).padStart(3, "0")}`,
          },
        },
        update: {
          name,
          isActive: true,
        },
        create: {
          plantId: plant.id,
          code: `PL01-IT-${String(index + 1).padStart(3, "0")}`,
          name,
          isActive: true,
        },
      });
    }
  });

  const [workstations, workers, injuryTypes] = await prisma.$transaction([
    prisma.workstation.findMany({
      where: { plantId: plant.id, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.employeeDirectory.findMany({
      where: { plantId: plant.id, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.injuryType.findMany({
      where: { plantId: plant.id, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return ok({
    workstations,
    workers,
    injuryTypes,
    summary: {
      workstations: workstations.length,
      workers: workers.length,
      injuryTypes: injuryTypes.length,
    },
  });
}

