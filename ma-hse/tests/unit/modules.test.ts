import { describe, expect, it } from "vitest";
import {
  MODULE_OPTIONS,
  PLANT_NAVIGATION_MODULES,
  moduleTogglesInputSchema,
  resolveModuleToggles,
} from "@/lib/modules";

describe("plant module catalogue", () => {
  it("includes Dashboard de Ambiente with its own canonical toggle and sidebar mapping", () => {
    expect(MODULE_OPTIONS).toContainEqual({
      key: "ENVIRONMENT_DASHBOARD",
      label: "Dashboard de Ambiente",
    });
    expect(PLANT_NAVIGATION_MODULES["environment-dashboard"]).toBe("ENVIRONMENT_DASHBOARD");
  });

  it("preserves the old environment-dashboard state for saved configurations without its new key", () => {
    expect(resolveModuleToggles({ MONTHLY_INPUTS: false }).ENVIRONMENT_DASHBOARD).toBe(false);
    expect(resolveModuleToggles({ MONTHLY_INPUTS: false, ENVIRONMENT_DASHBOARD: true }).ENVIRONMENT_DASHBOARD).toBe(true);
    expect(resolveModuleToggles({ MONTHLY_INPUTS: true }, { ENVIRONMENT_DASHBOARD: false }).ENVIRONMENT_DASHBOARD).toBe(false);
  });

  it("accepts only known module keys for persisted settings", () => {
    expect(moduleTogglesInputSchema.safeParse({ modules: { ENVIRONMENT_DASHBOARD: false } }).success).toBe(true);
    expect(moduleTogglesInputSchema.safeParse({ modules: { ENVIRONMENT_DASHBOARD: false, OTHER: true } }).success).toBe(false);
  });
});
