import { ok } from "@/lib/api";
import { requireAuth } from "@/lib/rbac/guards";
import { getPendingSewoValidationRows } from "@/lib/services/sewo-validation-service";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const rows = await getPendingSewoValidationRows({
    userId: auth.session.user.id,
    limit: 20,
  });

  return ok(rows);
}
