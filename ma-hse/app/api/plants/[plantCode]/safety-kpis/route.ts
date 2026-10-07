import { fail, ok } from "@/lib/api";
import { getPlantByCode } from "@/lib/plant";
import { requireAuth } from "@/lib/rbac/guards";
import { hasSafetyDashboardAccess } from "@/lib/rbac/dashboard";
import { SafetyKpiHistoryService } from "@/lib/safety-kpi-history/service";

export async function GET(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  if (!hasSafetyDashboardAccess(plantCode, auth.session.user.plantRoles)) return fail("FORBIDDEN", "Safety Dashboard access required", 403);
  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year") ?? new Date().getUTCFullYear());
  const compareTo = Number(url.searchParams.get("compareTo") ?? year - 1);
  if (!Number.isInteger(year) || !Number.isInteger(compareTo)) return fail("INVALID_INPUT", "year and compareTo must be integers", 422);
  const plant = await getPlantByCode(plantCode);
  return ok(await SafetyKpiHistoryService.getPlantYear(plant.id, plant.code, year, compareTo));
}
