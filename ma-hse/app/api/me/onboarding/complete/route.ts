import { fail, ok } from "@/lib/api";
import { assertSameOrigin } from "@/lib/http";
import { completeOnboarding } from "@/lib/onboarding";
import { onboardingMutationError, onboardingUserUnavailable } from "@/lib/onboarding-api";
import { requireAuth } from "@/lib/rbac/guards";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  if (!assertSameOrigin(request)) return fail("FORBIDDEN", "Invalid request origin", 403);

  try {
    const state = await completeOnboarding(auth.session.user.id);
    return state ? ok(state) : onboardingUserUnavailable();
  } catch (error) {
    return onboardingMutationError(error);
  }
}
