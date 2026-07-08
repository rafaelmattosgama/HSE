export const ALL_PLANTS_SCOPE = "all";
export const LAST_PLANT_COOKIE = "ma_hse_last_plant";

export const AGGREGATE_PLANT_MODULES = new Set(["communications", "actions", "validation"]);

export function isAllPlantsScope(plant: string) {
  return plant.toLowerCase() === ALL_PLANTS_SCOPE;
}

export function normalizePlantCode(code: string) {
  return code.trim().toLowerCase();
}

