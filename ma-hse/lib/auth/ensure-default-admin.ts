import { hash } from "bcryptjs";
import { RoleCode } from "@prisma/client";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const DEFAULT_ADMIN_EMAIL = "admin.n0@ma-hse.local";

const DEFAULT_ADMIN_NAME = "Admin N0";
const DEFAULT_ADMIN_PLANT = {
  code: "pl1",
  name: "PL1",
  timezone: "Europe/Lisbon",
  defaultLanguage: "pt",
} as const;

let bootstrapPromise: Promise<void> | null = null;

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
    const plant = await tx.plant.upsert({
      where: { code: DEFAULT_ADMIN_PLANT.code },
      update: {
        name: DEFAULT_ADMIN_PLANT.name,
        timezone: DEFAULT_ADMIN_PLANT.timezone,
        defaultLanguage: DEFAULT_ADMIN_PLANT.defaultLanguage,
      },
      create: {
        code: DEFAULT_ADMIN_PLANT.code,
        name: DEFAULT_ADMIN_PLANT.name,
        timezone: DEFAULT_ADMIN_PLANT.timezone,
        defaultLanguage: DEFAULT_ADMIN_PLANT.defaultLanguage,
      },
    });

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

    await tx.userPlantRole.upsert({
      where: {
        userId_plantId_roleId: {
          userId: user.id,
          plantId: plant.id,
          roleId: role.id,
        },
      },
      update: {},
      create: {
        userId: user.id,
        plantId: plant.id,
        roleId: role.id,
      },
    });
  });
}

export async function ensureDefaultAdminUser(email?: string) {
  if (env.NODE_ENV === "production") {
    return;
  }

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
