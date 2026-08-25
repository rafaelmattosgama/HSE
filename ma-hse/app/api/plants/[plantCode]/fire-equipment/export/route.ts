import { RoleCode } from "@prisma/client";
import { fail } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { FireEquipmentExportService } from "@/lib/services/fire-equipment-export-service";
import { fireEquipmentListExportInput } from "@/lib/validation/dtos";

export const runtime = "nodejs";

const EXPORT_ROLES: RoleCode[] = [RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR];

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, EXPORT_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, fireEquipmentListExportInput);
  if ("error" in parsed) return parsed.error;

  try {
    const xlsx = await FireEquipmentExportService.buildListXlsx(parsed.data.rows, {
      locale: auth.session.user.language,
    });
    return new Response(new Uint8Array(xlsx), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="equipamentos_incendio.xlsx"`,
      },
    });
  } catch (error) {
    return fail("EXPORT_FAILED", error instanceof Error ? error.message : "Failed to export the fire equipment list.", 500);
  }
}
