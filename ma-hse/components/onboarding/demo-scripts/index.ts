import { resolveOnboardingRoute } from "@/components/onboarding/onboarding-routes";
import type { OnboardingStep } from "@/components/onboarding/onboarding-types";
import { DEMO_PLANTS, type DemoScriptId } from "@/lib/demo-mode";
import { PresentationScript } from "./presentation";
import { TrainingN0Script } from "./training-n0";
import { TrainingN1Script } from "./training-n1";
import { TrainingN3Script } from "./training-n3";
import type { DemoScriptStep } from "./types";

export type { DemoScriptStep } from "./types";

export const DEMO_SCRIPTS: Record<DemoScriptId, DemoScriptStep[]> = {
  "demo-presentation": PresentationScript,
  "demo-training-n3": TrainingN3Script,
  "demo-training-n1": TrainingN1Script,
  "demo-training-n0": TrainingN0Script,
};

/**
 * Resolves a demo script for the viewer: pt copy for pt, en for every other
 * language, and "{plant}" routes pointed at the user's plant (or the first demo
 * plant for corporate/admin accounts, which have none).
 */
export function getDemoScriptSteps(id: DemoScriptId, locale: string, plantCode: string | null): OnboardingStep[] {
  const language = locale === "pt" ? "pt" : "en";
  const plant = plantCode ?? DEMO_PLANTS[0].code;
  return DEMO_SCRIPTS[id].map(({ copy, ...step }) => ({
    ...step,
    ...copy[language],
    route: resolveOnboardingRoute(step.route, plant),
  }));
}
