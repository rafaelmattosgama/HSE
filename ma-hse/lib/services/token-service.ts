import { prisma } from "@/lib/prisma";

export async function seedReportAndKioskTokens() {
  const plants = await prisma.plant.findMany({
    select: {
      code: true,
      accessTokens: {
        where: { isActive: true },
      },
    },
  });

  return plants.map((plant) => ({
    code: plant.code,
    activeTokenCount: plant.accessTokens.length,
  }));
}