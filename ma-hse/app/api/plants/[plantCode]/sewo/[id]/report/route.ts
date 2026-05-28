import { RoleCode } from "@prisma/client";
import { fail } from "@/lib/api";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { SewoExportService } from "@/lib/services/sewo-export";

const ALLOWED_ROLES: RoleCode[] = [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY];

export async function GET(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, ALLOWED_ROLES);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const sewo = await prisma.sEWO.findFirst({
    where: {
      id,
      plantId: plant.id,
    },
    select: { id: true },
  });

  if (!sewo) {
    return fail("NOT_FOUND", "SEWO not found", 404);
  }

  const format = new URL(request.url).searchParams.get("format") ?? "pdf";
  const reportType = new URL(request.url).searchParams.get("type") ?? "complete";
  const locale = await getServerUiLocale({
    userLanguage: auth.session.user.language,
    plantLanguage: plant.defaultLanguage,
  });

  if (reportType !== "summary" && (format === "xlsx" || format === "excel")) {
    const exported = await SewoExportService.buildExport(id, { locale });

    return new Response(new Uint8Array(exported.xlsx), {
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename=\"sewo-${plantCode}-${id}.xlsx\"`,
        "cache-control": "no-store",
      },
    });
  }

  const exported = reportType === "summary"
    ? await SewoExportService.buildExternalSummaryExport(id, { locale })
    : await SewoExportService.buildExport(id, { locale });

  return new Response(new Uint8Array(exported.pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename=\"sewo-${plantCode}-${id}.pdf\"`,
      "cache-control": "no-store",
    },
  });
}
