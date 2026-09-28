import { PlantAccessTokenType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { writeAuditLog } from "@/lib/audit";
import { generateAccessTokenValue, hashAccessToken } from "@/lib/security";

export class ReportQrRegenerationDisabledError extends Error {
  constructor() {
    super("Report QR token regeneration is disabled.");
    this.name = "ReportQrRegenerationDisabledError";
  }
}

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
  if (input.type === PlantAccessTokenType.REPORT && !env.REPORT_QR_REGENERATION_ENABLED) {
    throw new ReportQrRegenerationDisabledError();
  }

  const tokenValue = generateAccessTokenValue();

  await prisma.$transaction(async (tx) => {
    await tx.plantAccessToken.updateMany({
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

    const token = await tx.plantAccessToken.create({
      data: {
        plantId: input.plantId,
        type: input.type,
        tokenHash: hashAccessToken(tokenValue),
        createdBy: input.actorUserId,
        isActive: true,
      },
    });
    await writeAuditLog({
      entityType: "PlantAccessToken",
      entityId: token.id,
      action: "REGENERATE",
      actorUserId: input.actorUserId,
      plantId: input.plantId,
      diff: { after: { type: input.type, isActive: true }, fieldsChanged: ["tokenHash", "isActive"] },
    }, tx);
  });

  return tokenValue;
}
