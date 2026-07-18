import type { RoleCode } from "@prisma/client";
import type { AppLocale } from "@/lib/i18n/routing";

export type OnboardingStatusValue = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "DISMISSED";

export type OnboardingExperienceKind =
  | "FIRST_LOGIN"
  | "MODULE_FIRST_VISIT"
  | "NEW_FEATURE"
  | "IMPORTANT_CHANGE"
  | "ROLE_TIP";

export type OnboardingStep = {
  id: string;
  element: string;
  title: string;
  description: string;
  route?: string;
  requiredPermission?: string;
  kind?: OnboardingExperienceKind;
  contextKey?: string;
};

export type RoleOnboardingConfig = {
  role: RoleCode;
  steps: OnboardingStep[];
};

export type OnboardingState = {
  status: OnboardingStatusValue;
  onboardingVersion: number;
  currentVersion: number;
  onboardingStartedAt: string | null;
  onboardingCompletedAt: string | null;
  currentOnboardingStep: number;
};

export type OnboardingUserContext = {
  role: RoleCode;
  plantCode: string | null;
  permissions: string[];
  locale: AppLocale;
};
