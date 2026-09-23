import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { parseBody } from "@/lib/http";
import type { ModuleToggleKey } from "@/lib/modules";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { MANAGED_MODULE_ROLES, ROLE_MODULE_KEYS, ROLE_MODULE_TOGGLES_PARAMETER_KEY, resolveRoleModuleSettings } from "@/lib/role-modules";
import { getPlantRoleModuleSettings } from "@/lib/services/role-module-service";
import { roleModuleTogglesInput } from "@/lib/validation/dtos";

type Context = { params: Promise<{ plantCode: string }> };

export async function GET(_request: Request, context: Context) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;
  if (!("role" in auth) || (auth.role !== RoleCode.N0_ADMIN && auth.role !== RoleCode.N3_SAFETY)) return fail("FORBIDDEN", "Only N0 and the plant's N3 can manage these settings.", 403);
  const plant = await getPlantByCode(plantCode);
  const { authorized, roles } = await getPlantRoleModuleSettings(plant.id);
  return ok({ authorized, roles });
}

export async function POST(request: Request, context: Context) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;
  if (!("role" in auth) || (auth.role !== RoleCode.N0_ADMIN && auth.role !== RoleCode.N3_SAFETY)) return fail("FORBIDDEN", "Only N0 and the plant's N3 can manage these settings.", 403);
  const parsed = await parseBody(request, roleModuleTogglesInput);
  if ("error" in parsed) return parsed.error;
  const plant = await getPlantByCode(plantCode);
  return prisma.$transaction(async tx => {
    const config = await getPlantRoleModuleSettings(plant.id, tx);
    const next = structuredClone(config.overrides);
    for (const role of MANAGED_MODULE_ROLES) {
      for (const [module, enabled] of Object.entries(parsed.data.roles[role] ?? {})) {
        const key = module as ModuleToggleKey;
        if (!config.authorized[key] || !ROLE_MODULE_KEYS[role].includes(key)) {
          return fail("MODULE_NOT_AUTHORIZED", "A selected module is not authorized for this plant or profile. Reload the settings.", 403);
        }
        next[role][key] = enabled;
      }
    }
    const saved = await tx.systemParameter.upsert({
      where: { plantId_key: { plantId: plant.id, key: ROLE_MODULE_TOGGLES_PARAMETER_KEY } },
      create: { plantId: plant.id, key: ROLE_MODULE_TOGGLES_PARAMETER_KEY, valueJson: next },
      update: { valueJson: next },
    });
    await writeAuditLog({ entityType: "SystemParameter", entityId: saved.id, action: "UPDATE", actorUserId: auth.session.user.id, plantId: plant.id, diff: buildDiff(config.overrides, next) }, tx);
    return ok({ authorized: config.authorized, roles: resolveRoleModuleSettings(config.authorized, next) });
  });
}
