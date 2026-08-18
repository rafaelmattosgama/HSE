import { z } from "zod";

export const DEFAULT_MODULE_TOGGLES = {
  MAPA: true,
  VALIDATIONS: true,
  ACTIONS: true,
  SEWO: true,
  SMAT: true,
  CONTRACTORS: true,
  COMMUNICATIONS: true,
  MONTHLY_INPUTS: true,
  ENVIRONMENT_DASHBOARD: true,
  OCCUPATIONAL_HEALTH: true,
} as const;

export const MODULE_OPTIONS = [
  { key: "MAPA", label: "MAPA" },
  { key: "VALIDATIONS", label: "Validations" },
  { key: "ACTIONS", label: "Actions" },
  { key: "SEWO", label: "S-EWO" },
  { key: "SMAT", label: "SMAT" },
  { key: "CONTRACTORS", label: "Contractors" },
  { key: "COMMUNICATIONS", label: "Communications" },
  { key: "MONTHLY_INPUTS", label: "Monthly Inputs" },
  { key: "ENVIRONMENT_DASHBOARD", label: "Dashboard de Ambiente" },
  { key: "OCCUPATIONAL_HEALTH", label: "Occupational Health" },
] as const;

export const MODULE_TOGGLES_PARAMETER_KEY = "MODULE_TOGGLES";
export const GLOBAL_MODULE_TOGGLES_PARAMETER_KEY = "GLOBAL_MODULE_TOGGLES";

export type ModuleToggleKey = keyof typeof DEFAULT_MODULE_TOGGLES;
export type ModuleToggleMap = Record<ModuleToggleKey, boolean>;
export type ModuleToggleOverrides = Partial<ModuleToggleMap>;

export const MODULE_TOGGLE_KEYS = Object.keys(DEFAULT_MODULE_TOGGLES) as ModuleToggleKey[];

const MODULE_TOGGLE_SHAPE = Object.fromEntries(
  MODULE_TOGGLE_KEYS.map((key) => [key, z.boolean()]),
) as Record<ModuleToggleKey, z.ZodBoolean>;

export const moduleTogglesInputSchema = z.object({
  modules: z.object(MODULE_TOGGLE_SHAPE).partial().strict(),
});

function readModuleToggleOverrides(value: unknown): ModuleToggleOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const source = value as Record<string, unknown>;
  return MODULE_TOGGLE_KEYS.reduce<ModuleToggleOverrides>((overrides, key) => {
    if (typeof source[key] === "boolean") {
      overrides[key] = source[key];
    }
    return overrides;
  }, {});
}

/**
 * Merges global and plant settings while retaining the historical behaviour of
 * the environment dashboard. Before it had its own key, the dashboard followed
 * the Monthly Inputs setting; existing JSON records that lack the new key keep
 * that effective state until an N0 administrator saves an explicit selection.
 */
export function resolveModuleToggles(...values: unknown[]): ModuleToggleMap {
  let hasEnvironmentDashboardSetting = false;
  const modules: ModuleToggleMap = { ...DEFAULT_MODULE_TOGGLES };

  for (const value of values) {
    const overrides = readModuleToggleOverrides(value);
    if (typeof overrides.ENVIRONMENT_DASHBOARD === "boolean") {
      hasEnvironmentDashboardSetting = true;
    }
    Object.assign(modules, overrides);
  }

  if (!hasEnvironmentDashboardSetting) {
    modules.ENVIRONMENT_DASHBOARD = modules.MONTHLY_INPUTS;
  }

  return modules;
}

export function isModuleEnabled(module: ModuleToggleKey, ...values: unknown[]) {
  return resolveModuleToggles(...values)[module];
}

export const PLANT_NAVIGATION_MODULES: Partial<Record<string, ModuleToggleKey>> = {
  mapa: "MAPA",
  validation: "VALIDATIONS",
  actions: "ACTIONS",
  sewo: "SEWO",
  smat: "SMAT",
  "occupational-health": "OCCUPATIONAL_HEALTH",
  contractors: "CONTRACTORS",
  communications: "COMMUNICATIONS",
  "monthly-inputs": "MONTHLY_INPUTS",
  "environment-dashboard": "ENVIRONMENT_DASHBOARD",
};
