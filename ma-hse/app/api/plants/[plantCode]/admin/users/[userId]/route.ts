import { hash } from "bcryptjs";
import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { canCreateRole, getRoleAssignmentPlantId } from "@/lib/rbac/user-management";
import { updatePlantUserInput } from "@/lib/validation/dtos";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function manageableByN3(role: RoleCode) {
  return role === RoleCode.N4_SUPERVISOR || role === RoleCode.N5_OPERATOR || role === RoleCode.N6_HR;
}

function manageableByN2(role: RoleCode) {
  return role === RoleCode.N6_HR;
}

function canManageGlobalN1(actorRole: RoleCode) {
  return actorRole === RoleCode.N0_ADMIN || actorRole === RoleCode.N1_CORPORATE;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ plantCode: string; userId: string }> },
) {
  const { plantCode, userId } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY]);
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
      OR: [
        { plantId: plant.id },
        ...(canManageGlobalN1(actorRole) ? [{ plantId: null, role: { code: RoleCode.N1_CORPORATE } }] : []),
      ],
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
  if (actorRole === RoleCode.N2_PLANT_MANAGER) {
    const hasNonN6Role = plantRoleRow.user.plantRoles.some((entry) => !manageableByN2(entry.role.code));
    if (hasNonN6Role || !manageableByN2(parsed.data.role)) {
      return fail("FORBIDDEN", "N2 can only manage N6_HR user accounts", 403);
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
    const rolePlantId = getRoleAssignmentPlantId(parsed.data.role, plant.id);
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
        OR: [
          { plantId: plant.id },
          ...(parsed.data.role !== RoleCode.N1_CORPORATE && canManageGlobalN1(actorRole)
            ? [{ plantId: null, role: { code: RoleCode.N1_CORPORATE } }]
            : []),
        ],
      },
    });

    const existingPlantRole = await tx.userPlantRole.findFirst({
      where: {
        userId,
        plantId: rolePlantId,
        roleId: role.id,
      },
      include: {
        role: true,
      },
    });
    const plantRole =
      existingPlantRole ??
      (await tx.userPlantRole.create({
        data: {
          userId,
          plantId: rolePlantId,
          roleId: role.id,
        },
        include: {
          role: true,
        },
      }));

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
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;
  const actorRole = "role" in auth ? auth.role : RoleCode.N0_ADMIN;

  const plant = await getPlantByCode(plantCode);
  const plantRoleRow = await prisma.userPlantRole.findFirst({
    where: {
      userId,
      OR: [
        { plantId: plant.id },
        ...(canManageGlobalN1(actorRole) ? [{ plantId: null, role: { code: RoleCode.N1_CORPORATE } }] : []),
      ],
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
  if (actorRole === RoleCode.N2_PLANT_MANAGER) {
    const hasNonN6Role = plantRoleRow.user.plantRoles.some((entry) => !manageableByN2(entry.role.code));
    if (hasNonN6Role) {
      return fail("FORBIDDEN", "N2 can only manage N6_HR user accounts", 403);
    }
  }

  await prisma.userPlantRole.deleteMany({
    where: {
      userId,
      OR: [
        { plantId: plant.id },
        ...(plantRoleRow.role.code === RoleCode.N1_CORPORATE && canManageGlobalN1(actorRole)
          ? [{ plantId: null, role: { code: RoleCode.N1_CORPORATE } }]
          : []),
      ],
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
