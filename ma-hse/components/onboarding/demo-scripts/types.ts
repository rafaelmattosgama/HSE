import type { OnboardingStep } from "@/components/onboarding/onboarding-types";

type StepCopy = { title: string; description: string };

/** A demo script step: an onboarding step with its copy in pt and en (other UI languages fall back to en). */
export type DemoScriptStep = Omit<OnboardingStep, "title" | "description"> & {
  copy: { pt: StepCopy; en: StepCopy };
};
