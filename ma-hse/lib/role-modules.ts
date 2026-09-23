import type { RoleCode } from "@prisma/client";
import { MODULE_TOGGLE_KEYS, PLANT_NAVIGATION_MODULES, type ModuleToggleKey, type ModuleToggleMap, type ModuleToggleOverrides } from "@/lib/modules";

export const ROLE_MODULE_TOGGLES_PARAMETER_KEY = "ROLE_MODULE_TOGGLES";
export const MODULE_REQUEST_PATH_HEADER = "x-hse-request-path";
export const MANAGED_MODULE_ROLES = ["N4_SUPERVISOR", "N5_OPERATOR", "N6_HR"] as const;
export type ManagedModuleRole = typeof MANAGED_MODULE_ROLES[number];
export type RoleModuleSettings = Record<ManagedModuleRole, ModuleToggleMap>;
export type RoleModuleOverrides = Record<ManagedModuleRole, ModuleToggleOverrides>;

// These are the existing module permissions of each profile. N3 can restrict
// access within them, but cannot grant a new capability to a profile.
export const ROLE_MODULE_KEYS: Record<ManagedModuleRole, readonly ModuleToggleKey[]> = {
  N4_SUPERVISOR: ["MAPA", "ACTIONS", "SMAT", "CONTRACTORS", "COMMUNICATIONS", "COMPETENCE_AUTHORIZATIONS", "FIRE_SAFETY_EQUIPMENT"],
  N5_OPERATOR: ["MAPA", "ACTIONS", "COMMUNICATIONS", "COMPETENCE_AUTHORIZATIONS", "FIRE_SAFETY_EQUIPMENT"],
  N6_HR: ["ACTIONS", "SEWO", "COMMUNICATIONS", "OCCUPATIONAL_HEALTH", "COMPETENCE_AUTHORIZATIONS"],
};

export function isManagedModuleRole(role: RoleCode | undefined): role is ManagedModuleRole {
  return MANAGED_MODULE_ROLES.some(entry => entry === role);
}

export function readRoleModuleOverrides(value: unknown): RoleModuleOverrides {
  const result: RoleModuleOverrides = { N4_SUPERVISOR: {}, N5_OPERATOR: {}, N6_HR: {} };
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const role of MANAGED_MODULE_ROLES) {
    const row = (value as Record<string, unknown>)[role];
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    for (const key of ROLE_MODULE_KEYS[role]) {
      const setting = (row as Record<string, unknown>)[key];
      if (typeof setting === "boolean") result[role][key] = setting;
    }
  }
  return result;
}

export function resolveRoleModuleSettings(authorized: ModuleToggleMap, value: unknown): RoleModuleSettings {
  const overrides = readRoleModuleOverrides(value);
  return Object.fromEntries(MANAGED_MODULE_ROLES.map(role => [role, Object.fromEntries(
    MODULE_TOGGLE_KEYS.map(key => [key, authorized[key] && ROLE_MODULE_KEYS[role].includes(key) && overrides[role][key] !== false]),
  )])) as RoleModuleSettings;
}

export function getModuleRequestScope(pathname: string) {
  const match = pathname.match(/^\/(?:api\/plants|app)\/([^/]+)\/([^/]+)(?:\/|$)/);
  if (!match) return null;
  const moduleKey = PLANT_NAVIGATION_MODULES[decodeURIComponent(match[2])];
  return moduleKey ? { plantCode: decodeURIComponent(match[1]), moduleKey } : null;
}
