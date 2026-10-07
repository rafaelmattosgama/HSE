import { fail, ok } from "@/lib/api";
import { requireAuth } from "@/lib/rbac/guards";
import { SAFETY_KPI_MAX_IMPORT_BYTES, SafetyKpiExcelError } from "@/lib/safety-kpi-history/excel";
import { SafetyKpiHistoryService } from "@/lib/safety-kpi-history/service";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("INVALID_INPUT", "Expected multipart/form-data", 422); }
  const file = form.get("file");
  if (!(file instanceof File)) return fail("INVALID_INPUT", "Excel file is required", 422);
  if (!file.name.toLowerCase().endsWith(".xlsx")) return fail("INVALID_INPUT", "Only .xlsx files are supported", 422);
  if (file.size > SAFETY_KPI_MAX_IMPORT_BYTES) return fail("FILE_TOO_LARGE", "Excel file exceeds the 10 MB limit", 413);
  try {
    return ok(await SafetyKpiHistoryService.preview({ bytes: new Uint8Array(await file.arrayBuffer()), fileName: file.name, userId: auth.session.user.id, roles: auth.session.user.plantRoles }));
  } catch (error) {
    if (error instanceof SafetyKpiExcelError) return fail(error.code, error.message, 422);
    return fail("PREVIEW_FAILED", error instanceof Error ? error.message : "Preview failed", 422);
  }
}
