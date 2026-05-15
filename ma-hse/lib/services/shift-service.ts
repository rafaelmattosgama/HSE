import { DEFAULT_SHIFT_MASTER_DATA } from "@/lib/defaults/shifts";
import { prisma } from "@/lib/prisma";

export async function ensureDefaultShifts(plantId: string) {
  await prisma.$transaction(async (tx) => {
    for (const row of DEFAULT_SHIFT_MASTER_DATA) {
      await tx.shift.upsert({
        where: { plantId_code: { plantId, code: row.code } },
        update: { name: row.name, isActive: true },
        create: { plantId, ...row },
      });
    }
  });
}
