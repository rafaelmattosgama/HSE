import { RoleCode } from "@prisma/client";
import { fail } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { CompetenceExportService } from "@/lib/services/competence-export-service";
import { competenceMatrixExportInput } from "@/lib/validation/dtos";

export const runtime = "nodejs";

const EXPORT_ROLES: RoleCode[] = [RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR];

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, EXPORT_ROLES);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, competenceMatrixExportInput);
  if ("error" in parsed) return parsed.error;

  try {
    const xlsx = await CompetenceExportService.buildMatrixXlsx(parsed.data.columns, parsed.data.rows, {
      locale: auth.session.user.language,
    });
    return new Response(new Uint8Array(xlsx), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="competencias_matriz.xlsx"`,
      },
    });
  } catch (error) {
    return fail("EXPORT_FAILED", error instanceof Error ? error.message : "Failed to export the competence matrix.", 500);
  }
}
