import { hash } from "bcryptjs";
import { RoleCode } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const DEFAULT_ADMIN_EMAIL = env.N0_ADMIN_EMAIL ?? "admin@maxsafety.maportugal.com";

const DEFAULT_ADMIN_NAME = "Admin N0";

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

async function bootstrapDefaultAdmin() {
  const existingAdmin = await prisma.user.findUnique({
    where: { email: DEFAULT_ADMIN_EMAIL },
    select: { id: true },
  });

  if (existingAdmin) {
    return;
  }

  const passwordHash = await hash(env.SEED_DEFAULT_PASSWORD, 12);

  await prisma.$transaction(async (tx) => {
    const role = await tx.role.upsert({
      where: { code: RoleCode.N0_ADMIN },
      update: {},
      create: { code: RoleCode.N0_ADMIN },
    });

    const user = await tx.user.upsert({
      where: { email: DEFAULT_ADMIN_EMAIL },
      update: {
        name: DEFAULT_ADMIN_NAME,
        language: "pt",
        passwordHash,
        isActive: true,
      },
      create: {
        email: DEFAULT_ADMIN_EMAIL,
        name: DEFAULT_ADMIN_NAME,
        language: "pt",
        passwordHash,
        isActive: true,
      },
    });

    const plantId = await resolveN0PlantId();

    await tx.userPlantRole.create({
      data: {
        userId: user.id,
        plantId,
        roleId: role.id,
      },
    });
  });
}

export async function ensureDefaultAdminUser(email?: string) {
  if (email && email !== DEFAULT_ADMIN_EMAIL) {
    return;
  }

  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapDefaultAdmin().finally(() => {
      bootstrapPromise = null;
    });
  }

  await bootstrapPromise;
}
