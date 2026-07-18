import { fail, ok } from "@/lib/api";
import { getOnboardingState } from "@/lib/onboarding";
import { requireAuth } from "@/lib/rbac/guards";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const state = await getOnboardingState(auth.session.user.id);
  if (!state) return fail("FORBIDDEN", "User is inactive or unavailable", 403);

  return ok(state);
}
