import { PlantAccessTokenType, Prisma, RoleCode } from "@prisma/client";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { env } from "@/lib/env";
import { parseBody } from "@/lib/http";
import { findPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { regeneratePlantToken } from "@/lib/auth/plant-token";

const qrTokenSchema = z.object({
  type: z.nativeEnum(PlantAccessTokenType),
  regenerate: z.boolean().default(false),
  revoke: z.boolean().default(false),
});

function isMissingDatabaseObjectError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === "P2021" || error.code === "P2022");
}

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [
    RoleCode.N0_ADMIN,
    RoleCode.N1_CORPORATE,
    RoleCode.N2_PLANT_MANAGER,
    RoleCode.N3_SAFETY,
  ]);
  if ("error" in auth) return auth.error;

  const plant = await findPlantByCode(plantCode);
  if (!plant) {
    return fail("PLANT_NOT_FOUND", "Plant not found", 404);
  }

  const tokens = await (async () => {
    try {
      return await prisma.plantAccessToken.findMany({
        where: {
          plantId: plant.id,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    } catch (error) {
      if (isMissingDatabaseObjectError(error)) {
        return null;
      }
      throw error;
    }
  })();
  if (!tokens) {
    return fail("DATABASE_MIGRATION_REQUIRED", "QR token storage is not available.", 503);
  }

  return ok(tokens);
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [
    RoleCode.N0_ADMIN,
    RoleCode.N1_CORPORATE,
    RoleCode.N2_PLANT_MANAGER,
    RoleCode.N3_SAFETY,
  ]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, qrTokenSchema);
  if ("error" in parsed) return parsed.error;

  const plant = await findPlantByCode(plantCode);
  if (!plant) {
    return fail("PLANT_NOT_FOUND", "Plant not found", 404);
  }

  if (parsed.data.revoke) {
    try {
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
    } catch (error) {
      if (isMissingDatabaseObjectError(error)) {
        return fail("DATABASE_MIGRATION_REQUIRED", "QR token storage is not available.", 503);
      }
      throw error;
    }

    return ok({ revoked: true, type: parsed.data.type });
  }

  const token = await (async () => {
    try {
      return await regeneratePlantToken({
        plantId: plant.id,
        type: parsed.data.type,
        actorUserId: auth.session.user.id,
      });
    } catch (error) {
      if (isMissingDatabaseObjectError(error)) {
        return null;
      }
      throw error;
    }
  })();
  if (!token) {
    return fail("DATABASE_MIGRATION_REQUIRED", "QR token storage is not available.", 503);
  }

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
