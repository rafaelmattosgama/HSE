import { fail } from "@/lib/api";
import { OnboardingTransitionError } from "@/lib/onboarding";

export function onboardingUserUnavailable() {
  return fail("FORBIDDEN", "User is inactive or unavailable", 403);
}

export function onboardingMutationError(error: unknown) {
  if (error instanceof OnboardingTransitionError) {
    return fail("INVALID_ONBOARDING_STATE", error.message, 409);
  }

  throw error;
}
