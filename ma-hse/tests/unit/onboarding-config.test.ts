import { describe, expect, it } from "vitest";
import type { RoleCode } from "@prisma/client";
import {
  getOnboardingSteps,
  ONBOARDING_PERMISSIONS,
  ROLE_ONBOARDING_CONFIGS,
  resolveOnboardingRoute,
} from "@/components/onboarding/onboarding-config";
import { getOnboardingStepCopy } from "@/components/onboarding/onboarding-i18n";
import { locales } from "@/lib/i18n/routing";

const allPermissions = Object.values(ONBOARDING_PERMISSIONS);

function stepIds(role: RoleCode, permissions = allPermissions) {
  return getOnboardingSteps({ role, plantCode: "pl01", permissions, locale: "pt" }).map((step) => step.id);
}

describe("onboarding role configuration", () => {
  it("defines a centralized configuration for every real role", () => {
    expect(Object.keys(ROLE_ONBOARDING_CONFIGS).sort()).toEqual([
      "MEDICO",
      "N0_ADMIN",
      "N1_CORPORATE",
      "N2_PLANT_MANAGER",
      "N3_SAFETY",
      "N4_SUPERVISOR",
      "N5_OPERATOR",
    ]);
  });

  it("limits N2 to its actual management modules and excludes restricted features", () => {
    const ids = stepIds("N2_PLANT_MANAGER");

    expect(ids).toContain("sidebar-admin");
    expect(ids).toContain("sidebar-sewo");
    expect(ids).not.toContain("notifications");
    expect(ids).not.toContain("ai-assistant");
    expect(ids).not.toContain("settings-users");
  });

  it("includes N3-only operational features when their server context allows them", () => {
    const ids = stepIds("N3_SAFETY");

    expect(ids).toEqual(expect.arrayContaining([
      "notifications",
      "sidebar-validation",
      "sidebar-occupational-health",
      "sidebar-contractors",
      "ai-assistant",
    ]));
  });

  it("filters optional features when the server does not grant the permission", () => {
    const ids = stepIds("N3_SAFETY", [ONBOARDING_PERMISSIONS.PLANT_CONTEXT]);

    expect(ids).not.toContain("notifications");
    expect(ids).not.toContain("ai-assistant");
  });

  it("does not expose supervisor or operator tours to administrative modules", () => {
    expect(stepIds("N4_SUPERVISOR")).not.toContain("sidebar-admin");
    expect(stepIds("N5_OPERATOR")).not.toContain("sidebar-admin");
    expect(stepIds("N5_OPERATOR")).not.toContain("sidebar-smat");
  });

  it("resolves plant routes safely and omits them without a plant context", () => {
    expect(resolveOnboardingRoute("/app/{plant}/dashboards", "pt 01")).toBe("/app/pt%2001/dashboards");
    expect(resolveOnboardingRoute("/app/{plant}/dashboards", null)).toBeUndefined();
  });

  it("localizes every tour using the authenticated user's supported locale", () => {
    const expectedTopbarTitles = {
      pt: "Acesso rápido",
      en: "Quick access",
      it: "Accesso rapido",
      pl: "Szybki dostęp",
      de: "Schnellzugriff",
      ro: "Acces rapid",
      fr: "Accès rapide",
    } as const;

    for (const locale of locales) {
      const steps = getOnboardingSteps({
        role: "N3_SAFETY",
        plantCode: "pl01",
        permissions: allPermissions,
        locale,
      });
      expect(steps[0]?.title).toBe(expectedTopbarTitles[locale]);
      expect(steps.every((step) => step.title.length > 0 && step.description.length > 0)).toBe(true);
    }

    const configuredStepIds = new Set(
      Object.values(ROLE_ONBOARDING_CONFIGS).flatMap((config) => config.steps.map((step) => step.id)),
    );
    for (const locale of locales) {
      for (const stepId of configuredStepIds) {
        expect(getOnboardingStepCopy(locale, stepId), `${locale}:${stepId}`).not.toBeNull();
      }
    }
  });
});
