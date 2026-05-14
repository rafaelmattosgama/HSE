import { RoleCode } from "@prisma/client";
import { fail } from "@/lib/api";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { SmatService } from "@/lib/services/smat-service";

const ALLOWED_ROLES: RoleCode[] = [
  RoleCode.N1_CORPORATE,
  RoleCode.N2_PLANT_MANAGER,
  RoleCode.N3_SAFETY,
  RoleCode.N4_SUPERVISOR,
];

export async function GET(request: Request, context: { params: Promise<{ plantCode: string; id: string }> }) {
  const { plantCode, id } = await context.params;
  const auth = await requirePlantAccess(plantCode, ALLOWED_ROLES);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const audit = await prisma.smatAudit.findFirst({
    where: {
      id,
      plantId: plant.id,
    },
    select: { id: true },
  });

  if (!audit) {
    return fail("NOT_FOUND", "SMAT audit not found", 404);
  }

  const format = new URL(request.url).searchParams.get("format") ?? "pdf";
  const exported = await SmatService.buildExport(id);

  if (format === "xlsx" || format === "excel") {
    return new Response(new Uint8Array(exported.xlsx), {
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename=\"smat-${plantCode}-${id}.xlsx\"`,
        "cache-control": "no-store",
      },
    });
  }

  return new Response(new Uint8Array(exported.pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename=\"smat-${plantCode}-${id}.pdf\"`,
      "cache-control": "no-store",
    },
  });
}
