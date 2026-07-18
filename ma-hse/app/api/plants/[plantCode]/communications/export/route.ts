import { RoleCode } from "@prisma/client";
import { fail } from "@/lib/api";
import { parseBody } from "@/lib/http";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { ListExportService } from "@/lib/services/list-export-service";
import { communicationListExportInput } from "@/lib/validation/dtos";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, [
    RoleCode.N1_CORPORATE,
    RoleCode.N2_PLANT_MANAGER,
    RoleCode.N3_SAFETY,
    RoleCode.N4_SUPERVISOR,
    RoleCode.N5_OPERATOR,
    RoleCode.MEDICO,
  ]);
  if ("error" in auth) return auth.error;

  const parsed = await parseBody(request, communicationListExportInput);
  if ("error" in parsed) return parsed.error;

  const format = new URL(request.url).searchParams.get("format") ?? "xlsx";
  if (format === "pdf") {
    try {
      const pdf = await ListExportService.buildCommunicationsPdf(parsed.data.rows, { locale: auth.session.user.language });
      return new Response(new Uint8Array(pdf), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="comunicacoes_filtradas.pdf"`,
        },
      });
    } catch (error) {
      return fail("EXPORT_FAILED", error instanceof Error ? error.message : "Failed to export communications PDF.", 500);
    }
  }

  if (format !== "xlsx") {
    return fail("INVALID_FORMAT", "Export format must be xlsx or pdf.", 400);
  }

  const xlsx = await ListExportService.buildCommunicationsXlsx(parsed.data.rows, { locale: auth.session.user.language });
  return new Response(new Uint8Array(xlsx), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="comunicacoes_filtradas.xlsx"`,
    },
  });
}
