import { RoleCode } from "@prisma/client";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { parseBody } from "@/lib/http";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";

const updateUserStatusInput = z.object({
  isActive: z.boolean(),
});

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

  const parsed = await parseBody(request, updateUserStatusInput);
  if ("error" in parsed) return parsed.error;

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
    const manageableRoles: RoleCode[] = [RoleCode.N4_SUPERVISOR, RoleCode.N5_OPERATOR, RoleCode.N6_HR];
    const hasPrivilegedRole = plantRoleRow.user.plantRoles.some((roleRow) => !manageableRoles.includes(roleRow.role.code));
    if (hasPrivilegedRole) {
      return fail("FORBIDDEN", "N3 cannot manage privileged user accounts", 403);
    }
  }
  if (actorRole === RoleCode.N2_PLANT_MANAGER) {
    const hasNonN6Role = plantRoleRow.user.plantRoles.some((roleRow) => roleRow.role.code !== RoleCode.N6_HR);
    if (hasNonN6Role) {
      return fail("FORBIDDEN", "N2 can only manage N6_HR user accounts", 403);
    }
  }

  if (plantRoleRow.user.isActive === parsed.data.isActive) {
    return ok({
      user: {
        id: plantRoleRow.user.id,
        isActive: plantRoleRow.user.isActive,
      },
    });
  }

  const updated = await prisma.user.update({
    where: {
      id: plantRoleRow.user.id,
    },
    data: {
      isActive: parsed.data.isActive,
    },
  });

  await writeAuditLog({
    entityType: "User",
    entityId: updated.id,
    action: "UPDATE_STATUS",
    actorUserId: auth.session.user.id,
    plantId: plant.id,
    diff: buildDiff(
      {
        isActive: plantRoleRow.user.isActive,
      },
      {
        isActive: updated.isActive,
      },
    ),
  });

  return ok({
    user: {
      id: updated.id,
      isActive: updated.isActive,
    },
  });
}
