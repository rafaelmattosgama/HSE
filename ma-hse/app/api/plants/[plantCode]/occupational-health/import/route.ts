import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { OccupationalHealthService } from "@/lib/services/occupational-health-service";

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return fail("INVALID_INPUT", "Excel file is required", 422);
  }

  const plant = await getPlantByCode(plantCode);
  const imported = await OccupationalHealthService.importFromExcel(
    plant.id,
    new Uint8Array(await file.arrayBuffer()),
  );
  return ok(imported);
}
