import { RoleCode } from "@prisma/client";
import { fail } from "@/lib/api";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { getReadableCommunicationCode } from "@/lib/record-code";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { sanitizeCommunicationPdfFileName, supportsCommunicationPdfReport } from "@/lib/communication-report";
import { logger } from "@/lib/logger";
import { CommunicationReportExportService } from "@/lib/services/communication-report-export";

const ALLOWED_ROLES: RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
  RoleCode.N5_OPERATOR,
  RoleCode.MEDICO,
];

function getExportErrorLogDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      err: error,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    };
  }

  return {
    err: error,
    errorMessage: String(error),
  };
}

export async function GET(_request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, ALLOWED_ROLES);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const communication = await prisma.communication.findFirst({
    where: {
      id,
      plantId: plant.id,
    },
    select: {
      id: true,
      type: true,
      codigoCompleto: true,
      codigoAbreviado: true,
    },
  });

  if (!communication) {
    return fail("NOT_FOUND", "Communication not found", 404);
  }

  if (!supportsCommunicationPdfReport(communication.type)) {
    return fail("COMMUNICATION_REPORT_UNSUPPORTED_TYPE", "This communication type does not support PDF export", 400);
  }

  const locale = await getServerUiLocale({
    userLanguage: auth.session.user.language,
    plantLanguage: plant.defaultLanguage,
  });

  try {
    const pdf = await CommunicationReportExportService.buildPdf(id, { locale });
    const fileName = sanitizeCommunicationPdfFileName(getReadableCommunicationCode(communication));

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    logger.error(
      {
        ...getExportErrorLogDetails(error),
        plantCode,
        communicationId: id,
        actorUserId: auth.session.user.id,
      },
      "failed_to_export_communication_report",
    );

    return fail("COMMUNICATION_REPORT_EXPORT_FAILED", "Failed to export communication report", 500);
  }
}
