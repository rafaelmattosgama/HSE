import type { Prisma, RoleCode } from "@prisma/client";
import { GLOBAL_MODULE_TOGGLES_PARAMETER_KEY, MODULE_TOGGLES_PARAMETER_KEY, MODULE_TOGGLE_KEYS, resolveModuleToggles, type ModuleToggleMap } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { isAllPlantsScope } from "@/lib/plant-scope";
import { getModuleRequestScope, isManagedModuleRole, readRoleModuleOverrides, resolveRoleModuleSettings, ROLE_MODULE_TOGGLES_PARAMETER_KEY } from "@/lib/role-modules";

export async function getPlantRoleModuleSettings(plantId: string, client: Prisma.TransactionClient = prisma) {
  const [global, plant, roles] = await Promise.all([
    client.systemParameter.findFirst({ where: { plantId: null, key: GLOBAL_MODULE_TOGGLES_PARAMETER_KEY } }),
    client.systemParameter.findUnique({ where: { plantId_key: { plantId, key: MODULE_TOGGLES_PARAMETER_KEY } } }),
    client.systemParameter.findUnique({ where: { plantId_key: { plantId, key: ROLE_MODULE_TOGGLES_PARAMETER_KEY } } }),
  ]);
  const authorized = resolveModuleToggles(global?.valueJson, plant?.valueJson);
  const overrides = readRoleModuleOverrides(roles?.valueJson);
  return { authorized, overrides, roles: resolveRoleModuleSettings(authorized, overrides) };
}

type PlantRole = { plantId: string | null; plantCode: string | null; role: RoleCode };

export async function getUserRoleModules(plantCode: string, roles: PlantRole[]): Promise<ModuleToggleMap | null> {
  if (roles.some(entry => entry.role === "N0_ADMIN" || entry.role === "N1_CORPORATE")) return null;
  const scoped = roles.filter(entry => entry.plantId && (isAllPlantsScope(plantCode) || entry.plantCode === plantCode));
  if (!scoped.some(entry => isManagedModuleRole(entry.role))) return null;
  // Aggregate pages must not reveal a factory whose module was disabled.
  const settings = await Promise.all(scoped.map(async entry => {
    const config = await getPlantRoleModuleSettings(entry.plantId!);
    return isManagedModuleRole(entry.role) ? config.roles[entry.role] : config.authorized;
  }));
  return Object.fromEntries(MODULE_TOGGLE_KEYS.map(key => [key, settings.every(config => config[key])])) as ModuleToggleMap;
}

export async function isRoleModuleRequestAllowed(pathname: string, roles: PlantRole[]) {
  const scope = getModuleRequestScope(pathname);
  if (!scope) return true;
  const modules = await getUserRoleModules(scope.plantCode, roles);
  return modules === null || modules[scope.moduleKey];
}
