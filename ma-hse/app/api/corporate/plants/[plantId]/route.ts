import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { parseBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac/guards";
import { updateCorporatePlantInput } from "@/lib/validation/dtos";

async function requireAdmin() {
  const auth = await requireAuth();
  if ("error" in auth) return auth;

  const isAdmin = auth.session.user.plantRoles.some((entry) => entry.role === RoleCode.N0_ADMIN);
  if (!isAdmin) {
    return { error: fail("FORBIDDEN", "N0 admin access required", 403) };
  }

  return auth;
}

export async function PATCH(request: Request, context: { params: Promise<{ plantId: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { plantId } = await context.params;
  const parsed = await parseBody(request, updateCorporatePlantInput);
  if ("error" in parsed) return parsed.error;

  if (parsed.data.plantId !== plantId) {
    return fail("INVALID_INPUT", "Plant id mismatch", 422);
  }

  const before = await prisma.plant.findUnique({
    where: { id: plantId },
    select: {
      id: true,
      code: true,
      name: true,
      timezone: true,
      defaultLanguage: true,
      isActive: true,
    },
  });

  if (!before) {
    return fail("NOT_FOUND", "Plant not found", 404);
  }

  const normalizedCode = parsed.data.code.trim().toLowerCase();
  const duplicate = await prisma.plant.findFirst({
    where: {
      code: normalizedCode,
      id: { not: plantId },
    },
    select: { id: true },
  });

  if (duplicate) {
    return fail("CONFLICT", "Another plant already uses this code", 409);
  }

  const plant = await prisma.plant.update({
    where: { id: plantId },
    data: {
      code: normalizedCode,
      name: parsed.data.name.trim(),
      timezone: parsed.data.timezone.trim(),
      defaultLanguage: parsed.data.defaultLanguage,
      isActive: parsed.data.isActive,
    },
  });

  await writeAuditLog({
    entityType: "Plant",
    entityId: plant.id,
    action: "UPDATE",
    actorUserId: auth.session.user.id,
    plantId: plant.id,
    diff: buildDiff(before, {
      id: plant.id,
      code: plant.code,
      name: plant.name,
      timezone: plant.timezone,
      defaultLanguage: plant.defaultLanguage,
      isActive: plant.isActive,
    }),
  });

  return ok({ plant });
}

export async function DELETE(_request: Request, context: { params: Promise<{ plantId: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { plantId } = await context.params;
  const plant = await prisma.plant.findUnique({
    where: { id: plantId },
    include: {
      users: {
        select: {
          userId: true,
        },
      },
    },
  });

  if (!plant) {
    return fail("NOT_FOUND", "Plant not found", 404);
  }

  const usersToCheck = [...new Set(plant.users.map((entry) => entry.userId))];

  await prisma.plant.delete({
    where: { id: plant.id },
  });

  let deletedUsers = 0;
  for (const userId of usersToCheck) {
    const remainingRoles = await prisma.userPlantRole.count({ where: { userId } });
    if (remainingRoles === 0) {
      await prisma.user.delete({ where: { id: userId } });
      deletedUsers += 1;
    }
  }

  await writeAuditLog({
    entityType: "Plant",
    entityId: plant.id,
    action: "DELETE",
    actorUserId: auth.session.user.id,
    plantId: null,
    diff: buildDiff(
      {
        id: plant.id,
        code: plant.code,
        name: plant.name,
        timezone: plant.timezone,
        defaultLanguage: plant.defaultLanguage,
        isActive: plant.isActive,
      },
      null,
    ),
  });

  return ok({
    deletedPlantId: plant.id,
    deletedUsers,
  });
}
