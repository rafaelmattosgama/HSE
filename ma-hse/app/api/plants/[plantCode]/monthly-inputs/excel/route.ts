import { RoleCode } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { getPlantByCode } from "@/lib/plant";
import { requireAuth } from "@/lib/rbac/guards";
import { MonthlyInputExcelService } from "@/lib/services/monthly-input-excel-service";

function hasMonthlyInputAccess(roles: Array<{ plantCode: string | null; role: RoleCode }>, plantCode: string) {
  return roles.some(
    (entry) =>
      entry.role === RoleCode.N0_ADMIN ||
      entry.role === RoleCode.N1_CORPORATE ||
      (entry.plantCode === plantCode &&
        (entry.role === RoleCode.N2_PLANT_MANAGER || entry.role === RoleCode.N3_SAFETY)),
  );
}

function parseYear(value: string | null) {
  const year = Number(value ?? new Date().getUTCFullYear());
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null;
}

export async function GET(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  if (!hasMonthlyInputAccess(auth.session.user.plantRoles, plantCode)) {
    return fail("FORBIDDEN", "Monthly inputs available only for N0, N1, N2 and N3", 403);
  }

  const url = new URL(request.url);
  const year = parseYear(url.searchParams.get("year"));
  if (!year) {
    return fail("INVALID_INPUT", "year must be a valid integer between 2000 and 2100", 422);
  }

  const plant = await getPlantByCode(plantCode);
  const category = url.searchParams.get("category");
  const templateOnly = url.searchParams.get("template") === "1";
  const xlsx = await MonthlyInputExcelService.buildExport({
    plantId: plant.id,
    plantCode,
    plantName: plant.name,
    year,
    category,
    templateOnly,
  });

  const suffix = templateOnly ? "template" : "export";
  return new Response(new Uint8Array(xlsx), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="monthly-inputs-${plantCode}-${year}-${suffix}.xlsx"`,
    },
  });
}

export async function POST(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  if (!hasMonthlyInputAccess(auth.session.user.plantRoles, plantCode)) {
    return fail("FORBIDDEN", "Monthly inputs available only for N0, N1, N2 and N3", 403);
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return fail("INVALID_INPUT", "Excel file is required", 422);
  }

  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return fail("INVALID_INPUT", "Only .xlsx files are supported", 422);
  }

  if (file.size > MonthlyInputExcelService.maxImportBytes) {
    return fail("INVALID_INPUT", "Excel file is too large", 413);
  }

  const plant = await getPlantByCode(plantCode);
  const summary = await MonthlyInputExcelService.importFromExcel(plant.id, new Uint8Array(await file.arrayBuffer()));
  return ok(summary, { status: summary.errors.length > 0 ? 422 : 200 });
}
