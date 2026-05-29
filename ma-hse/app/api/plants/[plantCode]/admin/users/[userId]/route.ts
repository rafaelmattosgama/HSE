import { hash } from "bcryptjs";
import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { canCreateRole } from "@/lib/rbac/user-management";
import { updatePlantUserInput } from "@/lib/validation/dtos";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function manageableByN3(role: RoleCode) {
  return role === RoleCode.N4_SUPERVISOR || role === RoleCode.N5_OPERATOR || role === RoleCode.MEDICO;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ plantCode: string; userId: string }> },
) {
  const { plantCode, userId } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;
  const actorRole = "role" in auth ? auth.role : RoleCode.N0_ADMIN;

  const parsed = await parseBody(request, updatePlantUserInput);
  if ("error" in parsed) return parsed.error;

  if (!canCreateRole(actorRole, parsed.data.role)) {
    return fail("FORBIDDEN", "You cannot assign this role", 403);
  }

  if (parsed.data.role === RoleCode.N0_ADMIN) {
    return fail("FORBIDDEN", "N0_ADMIN role cannot be assigned through the application. N0 users can only be created via script.", 403);
  }

  const plant = await getPlantByCode(plantCode);
  const plantRoleRow = await prisma.userPlantRole.findFirst({
    where: {
      userId,
      plantId: plant.id,
    },
    include: {
      role: true,
      user: {
        include: {
          plantRoles: {
            include: {
              role: true,
            },
          },
        },
      },
    },
  });

  if (!plantRoleRow) {
    return fail("NOT_FOUND", "User not found for plant scope", 404);
  }

  if (actorRole === RoleCode.N3_SAFETY) {
    const hasPrivilegedRole = plantRoleRow.user.plantRoles.some((entry) => !manageableByN3(entry.role.code));
    if (hasPrivilegedRole || !manageableByN3(parsed.data.role)) {
      return fail("FORBIDDEN", "N3 cannot manage privileged user accounts", 403);
    }
  }

  const normalizedEmail = normalizeEmail(parsed.data.email);
  const duplicateEmailOwner = await prisma.user.findFirst({
    where: {
      email: normalizedEmail,
      id: { not: userId },
    },
    select: { id: true },
  });

  if (duplicateEmailOwner) {
    return fail("CONFLICT", "Another user already uses this email", 409);
  }

  const role = await prisma.role.findUnique({
    where: { code: parsed.data.role },
  });

  if (!role) {
    return fail("INVALID_ROLE", "Role not found", 422);
  }

  const beforeUser = {
    id: plantRoleRow.user.id,
    email: plantRoleRow.user.email,
    name: plantRoleRow.user.name,
    language: plantRoleRow.user.language,
    isActive: plantRoleRow.user.isActive,
    forcePasswordChange: plantRoleRow.user.forcePasswordChange,
    role: plantRoleRow.role.code,
  };

  const passwordHash = parsed.data.password ? await hash(parsed.data.password, 12) : null;

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: {
        email: normalizedEmail,
        name: parsed.data.name,
        language: parsed.data.language,
        isActive: parsed.data.isActive,
        ...(passwordHash ? { passwordHash, forcePasswordChange: false } : {}),
      },
    });

    await tx.userPlantRole.deleteMany({
      where: {
        userId,
        plantId: plant.id,
        roleId: { not: role.id },
      },
    });

    const plantRole = await tx.userPlantRole.upsert({
      where: {
        userId_plantId_roleId: {
          userId,
          plantId: plant.id,
          roleId: role.id,
        },
      },
      update: {},
      create: {
        userId,
        plantId: plant.id,
        roleId: role.id,
      },
      include: {
        role: true,
      },
    });

    return { user, plantRole };
  });

  await writeAuditLog({
    entityType: "User",
    entityId: updated.user.id,
    action: "UPDATE",
    actorUserId: auth.session.user.id,
    plantId: plant.id,
    diff: buildDiff(beforeUser, {
      id: updated.user.id,
      email: updated.user.email,
      name: updated.user.name,
      language: updated.user.language,
      isActive: updated.user.isActive,
      forcePasswordChange: updated.user.forcePasswordChange,
      role: updated.plantRole.role.code,
    }),
  });

  return ok({
    user: {
      id: updated.user.id,
      email: updated.user.email,
      name: updated.user.name,
      language: updated.user.language,
      isActive: updated.user.isActive,
      role: updated.plantRole.role.code,
      createdAt: updated.user.createdAt,
      updatedAt: updated.user.updatedAt,
    },
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ plantCode: string; userId: string }> },
) {
  const { plantCode, userId } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;
  const actorRole = "role" in auth ? auth.role : RoleCode.N0_ADMIN;

  const plant = await getPlantByCode(plantCode);
  const plantRoleRow = await prisma.userPlantRole.findFirst({
    where: {
      userId,
      plantId: plant.id,
    },
    include: {
      role: true,
      user: {
        include: {
          plantRoles: {
            include: {
              role: true,
            },
          },
        },
      },
    },
  });

  if (!plantRoleRow) {
    return fail("NOT_FOUND", "User not found for plant scope", 404);
  }

  if (actorRole === RoleCode.N3_SAFETY) {
    const hasPrivilegedRole = plantRoleRow.user.plantRoles.some((entry) => !manageableByN3(entry.role.code));
    if (hasPrivilegedRole) {
      return fail("FORBIDDEN", "N3 cannot manage privileged user accounts", 403);
    }
  }

  await prisma.userPlantRole.deleteMany({
    where: {
      userId,
      plantId: plant.id,
    },
  });

  const remainingRoles = await prisma.userPlantRole.count({ where: { userId } });
  let deletedUser = false;
  if (remainingRoles === 0) {
    await prisma.user.delete({ where: { id: userId } });
    deletedUser = true;
  }

  await writeAuditLog({
    entityType: "User",
    entityId: userId,
    action: "DELETE",
    actorUserId: auth.session.user.id,
    plantId: plant.id,
    diff: buildDiff(
      {
        id: plantRoleRow.user.id,
        email: plantRoleRow.user.email,
        name: plantRoleRow.user.name,
        language: plantRoleRow.user.language,
        isActive: plantRoleRow.user.isActive,
        role: plantRoleRow.role.code,
      },
      null,
    ),
  });

  return ok({
    deletedUserId: userId,
    deletedUser,
  });
}
