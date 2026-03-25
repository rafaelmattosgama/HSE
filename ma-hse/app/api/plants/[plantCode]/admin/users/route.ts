import crypto from "node:crypto";
import { hash } from "bcryptjs";
import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { env } from "@/lib/env";
import { parseBody } from "@/lib/http";
import { logger } from "@/lib/logger";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { canCreateRole, getCreatableRoles } from "@/lib/rbac/user-management";
import { EmailService } from "@/lib/services/email-service";
import { createPlantUserInput } from "@/lib/validation/dtos";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function generateTemporaryPassword() {
  return crypto.randomBytes(9).toString("base64url");
}

function toUserRow(input: {
  id: string;
  email: string | null;
  name: string;
  language: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  role: RoleCode;
}) {
  return {
    id: input.id,
    email: input.email,
    name: input.name,
    language: input.language,
    isActive: input.isActive,
    role: input.role,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;
  const actorRole = "role" in auth ? auth.role : RoleCode.N1_CORPORATE;

  const plant = await getPlantByCode(plantCode);

  const rows = await prisma.userPlantRole.findMany({
    where: {
      plantId: plant.id,
    },
    include: {
      role: true,
      user: true,
    },
  });

  const users = rows
    .map((row) =>
      toUserRow({
        id: row.user.id,
        email: row.user.email,
        name: row.user.name,
        language: row.user.language,
        isActive: row.user.isActive,
        role: row.role.code,
        createdAt: row.user.createdAt,
        updatedAt: row.user.updatedAt,
      }),
    )
    .sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  return ok({
    users,
    allowedCreateRoles: getCreatableRoles(actorRole),
  });
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;
  const actorRole = "role" in auth ? auth.role : RoleCode.N1_CORPORATE;

  try {
    const parsed = await parseBody(request, createPlantUserInput);
    if ("error" in parsed) return parsed.error;

    const targetRole = parsed.data.role;
    if (!canCreateRole(actorRole, targetRole)) {
      return fail("FORBIDDEN", "You cannot create users with this role", 403);
    }

    const plant = await getPlantByCode(plantCode);
    const normalizedEmail = normalizeEmail(parsed.data.email);

    const existingUser = await prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
      include: {
        plantRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (actorRole === RoleCode.N3_SAFETY && existingUser) {
      const manageableRoles: RoleCode[] = [RoleCode.N4_SUPERVISOR, RoleCode.N5_OPERATOR, RoleCode.MEDICO];
      const hasPrivilegedRole = existingUser.plantRoles.some((roleRow) => !manageableRoles.includes(roleRow.role.code));
      if (hasPrivilegedRole) {
        return fail("FORBIDDEN", "N3 cannot manage privileged user accounts", 403);
      }
    }

    const hasProvidedPassword = Boolean(parsed.data.password);
    const canReusePassword = Boolean(existingUser?.passwordHash);
    const requiresTemporaryPassword = !hasProvidedPassword && !canReusePassword;
    const generatedPassword = requiresTemporaryPassword ? generateTemporaryPassword() : null;
    const passwordToHash = parsed.data.password ?? generatedPassword;
    const passwordHash = passwordToHash ? await hash(passwordToHash, 12) : null;

    const role = await prisma.role.findUnique({
      where: {
        code: targetRole,
      },
    });

    if (!role) {
      return fail("INVALID_ROLE", "Role not found", 422);
    }

    const result = await prisma.$transaction(async (tx) => {
      const beforeUser = existingUser
        ? {
            id: existingUser.id,
            email: existingUser.email,
            name: existingUser.name,
            language: existingUser.language,
            isActive: existingUser.isActive,
            forcePasswordChange: existingUser.forcePasswordChange,
          }
        : null;

      const shouldUpdatePassword = Boolean(passwordHash);
      const forcePasswordChange = requiresTemporaryPassword ? true : hasProvidedPassword ? false : undefined;

      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: {
              name: parsed.data.name,
              language: parsed.data.language,
              isActive: parsed.data.isActive,
              ...(shouldUpdatePassword ? { passwordHash } : {}),
              ...(typeof forcePasswordChange === "boolean" ? { forcePasswordChange } : {}),
            },
          })
        : await tx.user.create({
            data: {
              email: normalizedEmail,
              name: parsed.data.name,
              language: parsed.data.language,
              isActive: parsed.data.isActive,
              passwordHash,
              forcePasswordChange: requiresTemporaryPassword,
            },
          });

      const beforePlantRole = await tx.userPlantRole.findFirst({
        where: {
          userId: user.id,
          plantId: plant.id,
        },
      });

      const plantRole = await tx.userPlantRole.upsert({
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
        include: {
          role: true,
        },
      });

      await tx.userPlantRole.deleteMany({
        where: {
          userId: user.id,
          plantId: plant.id,
          roleId: {
            not: role.id,
          },
        },
      });

      return {
        user,
        beforeUser,
        beforePlantRole,
        plantRole,
        created: !existingUser,
      };
    });

    let passwordDelivery: "UNCHANGED" | "CUSTOM_SET" | "TEMP_EMAILED" | "TEMP_MANUAL" = "UNCHANGED";
    let manualPassword: string | null = null;

    if (hasProvidedPassword) {
      passwordDelivery = "CUSTOM_SET";
    } else if (generatedPassword && result.user.email) {
      const loginUrl = `${env.APP_URL}/login`;
      try {
        await EmailService.sendTemporaryPassword({
          to: result.user.email,
          userName: result.user.name,
          temporaryPassword: generatedPassword,
          loginUrl,
        });
        passwordDelivery = "TEMP_EMAILED";
      } catch (error) {
        passwordDelivery = "TEMP_MANUAL";
        manualPassword = generatedPassword;
        logger.error(
          {
            error,
            email: result.user.email,
            userId: result.user.id,
            plantCode,
          },
          "failed_to_send_temporary_password_email",
        );
      }
    } else if (generatedPassword) {
      passwordDelivery = "TEMP_MANUAL";
      manualPassword = generatedPassword;
    }

    await writeAuditLog({
      entityType: "User",
      entityId: result.user.id,
      action: result.created ? "CREATE" : "UPDATE",
      actorUserId: auth.session.user.id,
      plantId: plant.id,
      diff: buildDiff(
        result.beforeUser,
        {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          language: result.user.language,
          isActive: result.user.isActive,
          forcePasswordChange: result.user.forcePasswordChange,
        },
      ),
    });

    await writeAuditLog({
      entityType: "UserPlantRole",
      entityId: `${result.user.id}:${plant.id}`,
      action: result.beforePlantRole ? "UPDATE_ROLE" : "ASSIGN_ROLE",
      actorUserId: auth.session.user.id,
      plantId: plant.id,
      diff: buildDiff(
        result.beforePlantRole
          ? {
              userId: result.beforePlantRole.userId,
              plantId: result.beforePlantRole.plantId,
              roleId: result.beforePlantRole.roleId,
            }
          : null,
        {
          userId: result.user.id,
          plantId: plant.id,
          roleId: result.plantRole.roleId,
        },
      ),
    });

    return ok({
      user: toUserRow({
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        language: result.user.language,
        isActive: result.user.isActive,
        role: result.plantRole.role.code,
        createdAt: result.user.createdAt,
        updatedAt: result.user.updatedAt,
      }),
      passwordDelivery,
      generatedPassword: manualPassword,
    }, { status: result.created ? 201 : 200 });
  } catch (error) {
    return fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to create user", 500);
  }
}
