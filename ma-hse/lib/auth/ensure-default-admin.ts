import { hash } from "bcryptjs";
import { RoleCode } from "@prisma/client";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export const DEFAULT_ADMIN_EMAIL = env.N0_ADMIN_EMAIL ?? "admin@maxsafety.com";

const DEFAULT_ADMIN_NAME = "Admin N0";

logger.info(
  { defaultAdminEmail: DEFAULT_ADMIN_EMAIL, envSource: !!env.N0_ADMIN_EMAIL },
  "ensure_default_admin_config_loaded",
);

let bootstrapPromise: Promise<void> | null = null;

async function resolveN0PlantId(): Promise<string | null> {
  if (!env.N0_PLANT_CODE) {
    return null;
  }

  const plant = await prisma.plant.findUnique({
    where: { code: env.N0_PLANT_CODE },
    select: { id: true },
  });

  if (!plant) {
    return null;
  }

  return plant.id;
}

async function bootstrapDefaultAdmin(emailOverride?: string) {
  const email = emailOverride ?? DEFAULT_ADMIN_EMAIL;
  const passwordHash = await hash(env.SEED_DEFAULT_PASSWORD, 12);

  logger.info({ email }, "bootstrapping_default_admin_user");

  await prisma.$transaction(async (tx) => {
    const role = await tx.role.upsert({
      where: { code: RoleCode.N0_ADMIN },
      update: {},
      create: { code: RoleCode.N0_ADMIN },
    });

    const user = await tx.user.upsert({
      where: { email },
      update: {
        name: DEFAULT_ADMIN_NAME,
        language: "pt",
        passwordHash,
        isActive: true,
      },
      create: {
        email,
        name: DEFAULT_ADMIN_NAME,
        language: "pt",
        passwordHash,
        isActive: true,
      },
    });

    const plantId = await resolveN0PlantId();

    const existingUpr = await tx.userPlantRole.findFirst({
      where: { userId: user.id, roleId: role.id, plantId },
    });

    if (!existingUpr) {
      await tx.userPlantRole.create({
        data: {
          userId: user.id,
          plantId,
          roleId: role.id,
        },
      });
    }
  });
}

async function lookupUserN0Status(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      plantRoles: {
        where: { role: { code: RoleCode.N0_ADMIN } },
        take: 1,
      },
    },
  });

  return user;
}

async function hasAnyN0Admin(): Promise<boolean> {
  const upr = await prisma.userPlantRole.findFirst({
    where: { role: { code: RoleCode.N0_ADMIN } },
    select: { id: true },
  });
  return upr !== null;
}

export async function ensureDefaultAdminUser(email?: string) {
  if (!email) {
    return;
  }

  const user = await lookupUserN0Status(email);

  if (user) {
    if (user.plantRoles.length > 0) {
      if (!user.isActive) {
        await prisma.user.update({
          where: { id: user.id },
          data: { isActive: true },
        });
        logger.warn({ userId: user.id, email }, "reactivated_inactive_n0_admin_user");
      }
      return;
    }
    logger.debug({ email }, "user_exists_without_n0_role_skipping");
    return;
  }

  const someN0Exists = await hasAnyN0Admin();
  if (someN0Exists) {
    logger.warn({ email }, "n0_admin_exists_with_different_email_not_creating");
    return;
  }

  logger.warn({ email }, "no_n0_admin_found_will_bootstrap");

  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapDefaultAdmin(email).finally(() => {
      bootstrapPromise = null;
    });
  }

  await bootstrapPromise;
}
