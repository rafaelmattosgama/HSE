import { getPlantByCode } from "@/lib/plant";
import { fail } from "@/lib/api";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { canManagePlantEquipment, MASTER_DATA_ADMIN_ROLES } from "@/lib/rbac/master-data";
import { MasterDataImportService } from "@/lib/services/master-data-import-service";

export async function GET(_: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [...MASTER_DATA_ADMIN_ROLES]);
  if ("error" in auth && auth.error) return auth.error;
  if (!("role" in auth)) return fail("FORBIDDEN", "Plant role could not be resolved.", 403);

  const plant = await getPlantByCode(plantCode);
  const template = await MasterDataImportService.buildExport(plant.id, {
    includeEquipments: canManagePlantEquipment(auth.role),
  });

  return new Response(new Uint8Array(template), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="master-data-template-${plantCode}.xlsx"`,
    },
  });
}
