import { hash } from "bcryptjs";
import { RoleCode } from "@prisma/client";
import { env } from "../lib/env";
import { prisma } from "../lib/prisma";

const DEFAULT_ADMIN_EMAIL = env.N0_ADMIN_EMAIL ?? "admin@maxsafety.com";

async function main() {
  const email = DEFAULT_ADMIN_EMAIL.trim().toLowerCase();
  const passwordHash = await hash(env.SEED_DEFAULT_PASSWORD, 12);

  const role = await prisma.role.upsert({
    where: { code: RoleCode.N0_ADMIN },
    update: {},
    create: { code: RoleCode.N0_ADMIN },
  });

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: "Admin N0",
      language: "pt",
      passwordHash,
      isActive: true,
      forcePasswordChange: false,
    },
    create: {
      email,
      name: "Admin N0",
      language: "pt",
      passwordHash,
      isActive: true,
      forcePasswordChange: false,
    },
  });

  const existingRole = await prisma.userPlantRole.findFirst({
    where: {
      userId: user.id,
      roleId: role.id,
      plantId: null,
    },
  });

  if (!existingRole) {
    await prisma.userPlantRole.create({
      data: {
        userId: user.id,
        roleId: role.id,
        plantId: null,
      },
    });
  }

  const n0Admins = await prisma.userPlantRole.findMany({
    where: { roleId: role.id },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`N0 admin ensured: ${email}`);
  console.log("Existing N0 accounts:");
  for (const admin of n0Admins) {
    console.log(`- ${admin.user.email ?? "(no email)"} plantId=${admin.plantId ?? "null"} active=${admin.user.isActive}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
