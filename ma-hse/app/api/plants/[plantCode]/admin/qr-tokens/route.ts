import { PlantAccessTokenType, RoleCode } from "@prisma/client";
import { z } from "zod";
import { ok } from "@/lib/api";
import { env } from "@/lib/env";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { regeneratePlantToken } from "@/lib/auth/plant-token";

const qrTokenSchema = z.object({
  type: z.nativeEnum(PlantAccessTokenType),
  regenerate: z.boolean().default(false),
  revoke: z.boolean().default(false),
});

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const tokens = await prisma.plantAccessToken.findMany({
    where: {
      plantId: plant.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return ok(tokens);
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, qrTokenSchema);
  if ("error" in parsed) return parsed.error;

  const plant = await getPlantByCode(plantCode);

  if (parsed.data.revoke) {
    await prisma.plantAccessToken.updateMany({
      where: {
        plantId: plant.id,
        type: parsed.data.type,
        isActive: true,
        revokedAt: null,
      },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });

    return ok({ revoked: true, type: parsed.data.type });
  }

  const token = await regeneratePlantToken({
    plantId: plant.id,
    type: parsed.data.type,
    actorUserId: auth.session.user.id,
  });

  const path =
    parsed.data.type === PlantAccessTokenType.REPORT
      ? `/r/${plant.code}/report`
      : `/r/${plant.code}/kiosk`;
  const publicUrl = new URL(path, env.APP_URL);
  publicUrl.searchParams.set("t", token);

  return ok({
    type: parsed.data.type,
    token,
    path,
    publicUrl: publicUrl.toString(),
  });
}
