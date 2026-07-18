import { fail, ok } from "@/lib/api";
import { assertSameOrigin, parseBody } from "@/lib/http";
import { updateOnboardingProgress } from "@/lib/onboarding";
import { onboardingMutationError, onboardingUserUnavailable } from "@/lib/onboarding-api";
import { requireAuth } from "@/lib/rbac/guards";
import { updateOnboardingProgressInput } from "@/lib/validation/dtos";

export async function PATCH(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  if (!assertSameOrigin(request)) return fail("FORBIDDEN", "Invalid request origin", 403);

  const parsed = await parseBody(request, updateOnboardingProgressInput);
  if ("error" in parsed) return parsed.error;

  try {
    const state = await updateOnboardingProgress(auth.session.user.id, parsed.data.step);
    return state ? ok(state) : onboardingUserUnavailable();
  } catch (error) {
    return onboardingMutationError(error);
  }
}
