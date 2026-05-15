import { RoleCode } from "@prisma/client";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { MasterDataImportService } from "@/lib/services/master-data-import-service";

export async function GET(_: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const template = await MasterDataImportService.buildTemplate();

  return new Response(new Uint8Array(template), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="master-data-template-${plantCode}.xlsx"`,
    },
  });
}
