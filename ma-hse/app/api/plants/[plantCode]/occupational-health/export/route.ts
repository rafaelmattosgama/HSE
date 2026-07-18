import { RoleCode } from "@prisma/client";
import { getPlantByCode } from "@/lib/plant";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { OccupationalHealthService } from "@/lib/services/occupational-health-service";

export async function GET(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const format = new URL(request.url).searchParams.get("format") ?? "xlsx";
  const exported = await OccupationalHealthService.buildExport(
    plant.id,
    plantCode,
    auth.session.user.language,
  );

  if (format === "pdf") {
    return new Response(new Uint8Array(exported.pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="occupational-health-${plantCode}.pdf"`,
      },
    });
  }

  return new Response(new Uint8Array(exported.xlsx), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="occupational-health-${plantCode}.xlsx"`,
    },
  });
}
