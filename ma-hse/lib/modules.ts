export const DEFAULT_MODULE_TOGGLES = {
  MAPA: true,
  VALIDATIONS: true,
  ACTIONS: true,
  SEWO: true,
  SMAT: true,
  CONTRACTORS: true,
  COMMUNICATIONS: true,
  MONTHLY_INPUTS: true,
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
  { key: "OCCUPATIONAL_HEALTH", label: "Occupational Health" },
] as const;

export const MODULE_TOGGLES_PARAMETER_KEY = "MODULE_TOGGLES";
export const GLOBAL_MODULE_TOGGLES_PARAMETER_KEY = "GLOBAL_MODULE_TOGGLES";

export type ModuleToggleKey = keyof typeof DEFAULT_MODULE_TOGGLES;
export type ModuleToggleMap = Record<ModuleToggleKey, boolean>;
