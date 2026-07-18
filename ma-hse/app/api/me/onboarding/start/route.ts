import { ok, fail } from "@/lib/api";
import { assertSameOrigin } from "@/lib/http";
import { startOnboarding } from "@/lib/onboarding";
import { onboardingMutationError, onboardingUserUnavailable } from "@/lib/onboarding-api";
import { requireAuth } from "@/lib/rbac/guards";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  if (!assertSameOrigin(request)) return fail("FORBIDDEN", "Invalid request origin", 403);

  try {
    const state = await startOnboarding(auth.session.user.id);
    return state ? ok(state) : onboardingUserUnavailable();
  } catch (error) {
    return onboardingMutationError(error);
  }
}
