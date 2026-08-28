import { MasterDataEntityType, RoleCode } from "@prisma/client";
import { fail } from "@/lib/api";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { getServerUiLocale } from "@/lib/server-ui-language";
import { CompetenceExportService } from "@/lib/services/competence-export-service";
import { localizeMasterDataRows } from "@/lib/services/master-data-translation-service";

export const runtime = "nodejs";

const VIEW_ROLES: RoleCode[] = [
  RoleCode.N0_ADMIN,
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
  RoleCode.N5_OPERATOR,
  RoleCode.N6_HR,
];

/** §6.3: individual authorization PDF, for signature, via pdfkit-helper.ts (createPdfDocument). */
export async function GET(_request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, VIEW_ROLES);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const authorization = await prisma.workerAuthorization.findFirst({
    where: { id, plantId: plant.id },
    include: {
      competenceWorker: { include: { employee: true, area: true } },
      competenceType: true,
      grantedBy: true,
    },
  });
  if (!authorization) return fail("NOT_FOUND", "Authorization not found", 404);

  const role = "role" in auth ? auth.role : RoleCode.N5_OPERATOR;
  if (role === RoleCode.N5_OPERATOR) {
    const self = await prisma.user.findUnique({ where: { id: auth.session.user.id }, select: { employeeDirectoryId: true } });
    if (!self?.employeeDirectoryId || self.employeeDirectoryId !== authorization.competenceWorker.employeeDirectoryId) {
      return fail("NOT_FOUND", "Authorization not found", 404);
    }
  }

  const locale = await getServerUiLocale({
    userLanguage: auth.session.user.language,
    plantLanguage: plant.defaultLanguage,
  });
  const areaRows = authorization.competenceWorker.area ? [authorization.competenceWorker.area] : [];
  const localizedAreas = await localizeMasterDataRows(MasterDataEntityType.AREA, areaRows, locale);
  const departmentName = localizedAreas[0]?.name ?? authorization.competenceWorker.area?.name ?? null;

  try {
    const pdf = await CompetenceExportService.buildAuthorizationPdf({
      plantName: plant.name,
      workerName: authorization.competenceWorker.employee.name,
      employeeNo: authorization.competenceWorker.employee.employeeNo,
      departmentName,
      roleName: authorization.competenceWorker.roleName,
      competenceTypeName: authorization.competenceType.name,
      legalReference: authorization.competenceType.legalReference,
      sequenceNumber: authorization.sequenceNumber,
      validFrom: authorization.validFrom,
      validUntil: authorization.validUntil,
      restrictions: authorization.restrictions,
      status: authorization.status,
      grantedByName: authorization.grantedBy.name,
      grantedAt: authorization.grantedAt,
      locale,
    });

    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="autorizacao_${authorization.sequenceNumber ?? authorization.id}.pdf"`,
      },
    });
  } catch (error) {
    return fail("EXPORT_FAILED", error instanceof Error ? error.message : "Failed to generate the authorization PDF.", 500);
  }
}
