import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { requireAuth } from "@/lib/rbac/guards";
import { SafetyKpiHistoryService } from "@/lib/safety-kpi-history/service";

const input = z.object({ batchId: z.string().uuid(), conflictStrategy: z.enum(["SKIP", "REPLACE"]).default("SKIP") });
export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const parsed = await parseBody(request, input);
  if ("error" in parsed) return parsed.error;
  try {
    return ok(await SafetyKpiHistoryService.commit({ batchId: parsed.data.batchId, strategy: parsed.data.conflictStrategy, userId: auth.session.user.id, roles: auth.session.user.plantRoles }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Commit failed";
    return fail(message.includes("not allowed") || message.includes("not available") ? "FORBIDDEN" : "COMMIT_FAILED", message, message.includes("not allowed") || message.includes("not available") ? 403 : 422);
  }
}
