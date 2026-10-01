import { hash } from "bcryptjs";
import { RoleCode } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { GeneralSettingsError } from "@/lib/services/general-settings-service";

export const GENERAL_USER_ROLES = [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY] as const;
export const generalUserInput = z.object({
  email: z.string().trim().email().transform(value => value.toLowerCase()), name: z.string().trim().min(2),
  language: z.enum(["pt", "it", "en", "pl", "de", "ro", "fr"]).default("en"),
  role: z.enum(GENERAL_USER_ROLES), plantIds: z.array(z.string().uuid()).default([]),
  password: z.string().min(8).optional(), isActive: z.boolean().default(true),
}).refine(input => input.role !== RoleCode.N3_SAFETY || input.plantIds.length > 0, { message: "Select at least one plant for N3.", path: ["plantIds"] });

export async function listGeneralUsers() {
  const users = await prisma.user.findMany({
    where: { plantRoles: { some: { role: { code: { in: [...GENERAL_USER_ROLES] } } } } },
    include: { plantRoles: { include: { role: true } } }, orderBy: { name: "asc" },
  });
  return users.map(user => ({
    id: user.id, name: user.name, email: user.email, language: user.language, isActive: user.isActive,
    createdAt: user.createdAt, updatedAt: user.updatedAt,
    role: GENERAL_USER_ROLES.find(role => user.plantRoles.some(entry => entry.role.code === role))!,
    plantIds: user.plantRoles.filter(entry => entry.role.code === RoleCode.N3_SAFETY && entry.plantId).map(entry => entry.plantId!),
  }));
}

export async function saveGeneralUser(input: z.infer<typeof generalUserInput>, actorUserId: string, userId?: string) {
  if (!userId && !input.password) throw new GeneralSettingsError("Set an initial password for the new user.", 422);
  if (actorUserId === userId && (input.role !== RoleCode.N0_ADMIN || !input.isActive)) {
    throw new GeneralSettingsError("You cannot remove your own administrator access.", 422);
  }
  const passwordHash = input.password ? await hash(input.password, 12) : undefined;
  return prisma.$transaction(async tx => {
    const existing = userId ? await tx.user.findUnique({ where: { id: userId }, include: { plantRoles: { include: { role: true } } } }) : null;
    if (userId && (!existing || !existing.plantRoles.some(entry => GENERAL_USER_ROLES.includes(entry.role.code as typeof GENERAL_USER_ROLES[number])))) {
      throw new GeneralSettingsError("User not found in general settings.", 404);
    }
    const duplicate = await tx.user.findUnique({ where: { email: input.email } });
    if (duplicate && duplicate.id !== userId) throw new GeneralSettingsError("Another user already uses this email.", 409);
    const role = await tx.role.findUnique({ where: { code: input.role } });
    if (!role) throw new GeneralSettingsError("Role not found.", 422);
    const plantIds = input.role === RoleCode.N3_SAFETY ? [...new Set(input.plantIds)] : [];
    if (plantIds.length && await tx.plant.count({ where: { id: { in: plantIds } } }) !== plantIds.length) {
      throw new GeneralSettingsError("One or more assigned plants do not exist.", 422);
    }
    const data = { email: input.email, name: input.name, language: input.language, isActive: input.isActive,
      ...(passwordHash ? { passwordHash, forcePasswordChange: !userId } : {}) };
    const user = userId ? await tx.user.update({ where: { id: userId }, data }) : await tx.user.create({ data });
    await tx.userPlantRole.deleteMany({ where: { userId: user.id, role: { code: { in: [...GENERAL_USER_ROLES] } } } });
    for (const plantId of input.role === RoleCode.N3_SAFETY ? plantIds : [null]) {
      await tx.userPlantRole.create({ data: { userId: user.id, roleId: role.id, plantId } });
    }
    await writeAuditLog({ entityType: "User", entityId: user.id, action: userId ? "UPDATE" : "CREATE", actorUserId,
      diff: {
        before: existing ? { email: existing.email, name: existing.name, isActive: existing.isActive, roles: existing.plantRoles.map(row => ({ role: row.role.code, plantId: row.plantId })) } : null,
        after: { email: user.email, name: user.name, isActive: user.isActive, role: input.role, plantIds },
        fieldsChanged: ["email", "name", "isActive", "roles"],
      } }, tx);
    return { user: { id: user.id }, passwordDelivery: passwordHash ? "CUSTOM_SET" : "UNCHANGED" };
  });
}

export async function changeGeneralUserStatus(userId: string, isActive: boolean, actorUserId: string) {
  if (userId === actorUserId && !isActive) throw new GeneralSettingsError("You cannot deactivate your own administrator account.", 422);
  return prisma.$transaction(async tx => {
    const user = await tx.user.findFirst({ where: { id: userId, plantRoles: { some: { role: { code: { in: [...GENERAL_USER_ROLES] } } } } } });
    if (!user) throw new GeneralSettingsError("User not found in general settings.", 404);
    await tx.user.update({ where: { id: userId }, data: { isActive } });
    await writeAuditLog({ entityType: "User", entityId: userId, action: "UPDATE_STATUS", actorUserId,
      diff: { before: { isActive: user.isActive }, after: { isActive }, fieldsChanged: ["isActive"] } }, tx);
    return { user: { id: userId, isActive } };
  });
}
