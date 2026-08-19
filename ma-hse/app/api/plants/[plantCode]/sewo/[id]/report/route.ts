import { RoleCode } from "@prisma/client";
import { fail } from "@/lib/api";
import { logger } from "@/lib/logger";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { SewoExportService } from "@/lib/services/sewo-export";

const ALLOWED_ROLES: RoleCode[] = [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY];

function getExportErrorLogDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      err: error,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      errorCause: error.cause instanceof Error
        ? {
            name: error.cause.name,
            message: error.cause.message,
            stack: error.cause.stack,
          }
        : error.cause,
    };
  }

  return {
    err: error,
    errorMessage: String(error),
  };
}

export async function GET(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, ALLOWED_ROLES);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const sewo = await prisma.sEWO.findFirst({
    where: {
      id,
      plantId: plant.id,
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!sewo) {
    return fail("NOT_FOUND", "SEWO not found", 404);
  }

  const searchParams = new URL(request.url).searchParams;
  const format = searchParams.get("format") ?? "pdf";
  const reportType = searchParams.get("type") ?? "complete";
  const locale = await getServerUiLocale({
    userLanguage: auth.session.user.language,
    plantLanguage: plant.defaultLanguage,
  });

  try {
    if (reportType !== "summary" && (format === "xlsx" || format === "excel")) {
      const exported = await SewoExportService.buildExport(id, { locale, exportedBy: auth.session.user.name });

      return new Response(new Uint8Array(exported.xlsx), {
        status: 200,
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": `attachment; filename=\"s-ewo-${id}.xlsx\"`,
          "cache-control": "no-store",
        },
      });
    }

    const exported = reportType === "summary"
      ? await SewoExportService.buildExternalSummaryExport(id, { locale })
      : await SewoExportService.buildExport(id, { locale, exportedBy: auth.session.user.name, includeXlsx: false });

    return new Response(new Uint8Array(exported.pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename=\"s-ewo-${id}.pdf\"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    logger.error(
      {
        ...getExportErrorLogDetails(error),
        plantCode,
        sewoId: id,
        format,
        reportType,
        actorUserId: auth.session.user.id,
      },
      "failed_to_export_sewo_report",
    );

    return fail("SEWO_REPORT_EXPORT_FAILED", "Failed to export S-EWO report", 500);
  }
}
