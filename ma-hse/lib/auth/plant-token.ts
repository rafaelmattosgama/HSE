import { PlantAccessTokenType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateAccessTokenValue, hashAccessToken } from "@/lib/security";

export async function verifyPlantToken(input: {
  plantId: string;
  type: PlantAccessTokenType;
  token: string;
}) {
  const tokenHash = hashAccessToken(input.token);

  return prisma.plantAccessToken.findFirst({
    where: {
      plantId: input.plantId,
      type: input.type,
      tokenHash,
      isActive: true,
      revokedAt: null,
    },
  });
}

export async function regeneratePlantToken(input: {
  plantId: string;
  type: PlantAccessTokenType;
  actorUserId: string;
}) {
  await prisma.plantAccessToken.updateMany({
    where: {
      plantId: input.plantId,
      type: input.type,
      isActive: true,
      revokedAt: null,
    },
    data: {
      isActive: false,
      revokedAt: new Date(),
    },
  });

  const tokenValue = generateAccessTokenValue();

  await prisma.plantAccessToken.create({
    data: {
      plantId: input.plantId,
      type: input.type,
      tokenHash: hashAccessToken(tokenValue),
      createdBy: input.actorUserId,
      isActive: true,
    },
  });

  return tokenValue;
}