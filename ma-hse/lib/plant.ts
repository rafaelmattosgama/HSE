import { Plant } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function findPlantByCode(plantCode: string): Promise<Plant | null> {
  const trimmedCode = plantCode.trim();
  if (!trimmedCode) return null;

  const exactPlant = await prisma.plant.findUnique({
    where: { code: trimmedCode },
  });
  if (exactPlant) return exactPlant;

  return prisma.plant.findFirst({
    where: {
      code: {
        equals: trimmedCode,
        mode: "insensitive",
      },
    },
  });
}

export async function getPlantByCode(plantCode: string): Promise<Plant> {
  const plant = await findPlantByCode(plantCode);
  if (!plant) {
    throw new Error(`Plant not found: ${plantCode}`);
  }

  return plant;
}
