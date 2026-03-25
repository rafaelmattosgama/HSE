import { Plant } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getPlantByCode(plantCode: string): Promise<Plant> {
  return prisma.plant.findUniqueOrThrow({
    where: { code: plantCode },
  });
}