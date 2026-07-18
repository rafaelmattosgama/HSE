import { fail, ok } from "@/lib/api";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { canManagePlantEquipment, MASTER_DATA_ADMIN_ROLES } from "@/lib/rbac/master-data";
import { MasterDataImportService } from "@/lib/services/master-data-import-service";

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [...MASTER_DATA_ADMIN_ROLES]);
  if ("error" in auth && auth.error) return auth.error;
  if (!("role" in auth)) return fail("FORBIDDEN", "Plant role could not be resolved.", 403);

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return fail("INVALID_INPUT", "Excel file is required", 422);
  }

  const plant = await getPlantByCode(plantCode);
  const summary = await MasterDataImportService.importFromExcel(
    plant.id,
    new Uint8Array(await file.arrayBuffer()),
    {
      sourceLanguage: auth.session.user.language,
      includeEquipments: canManagePlantEquipment(auth.role),
    },
  );
  await writeAuditLog({
    entityType: "MasterDataImport",
    entityId: plant.id,
    action: "IMPORT",
    actorUserId: auth.session.user.id,
    plantId: plant.id,
    diff: buildDiff(null, summary),
  });
  return ok({ summary });
}
