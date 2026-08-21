import { NextResponse } from "next/server";
import { RoleCode } from "@prisma/client";
import { fail } from "@/lib/api";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { StorageService } from "@/lib/services/storage-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ plantCode: string; id: string }> },
) {
  const { plantCode, id } = await context.params;

  const auth = await requirePlantAccess(plantCode, [
    RoleCode.N1_CORPORATE,
    RoleCode.N2_PLANT_MANAGER,
    RoleCode.N3_SAFETY,
    RoleCode.N4_SUPERVISOR,
    RoleCode.N5_OPERATOR,
  ]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const document = await prisma.mapDocument.findFirst({
    where: { id, plantId: plant.id },
    select: { fileKey: true, fileName: true, contentType: true },
  });

  if (!document) {
    return fail("NOT_FOUND", "Map document not found", 404);
  }

  const buffer = await StorageService.getObjectBuffer({ key: document.fileKey });
  const safeFileName = document.fileName.replace(/[\r\n"]/g, "");

  return new NextResponse(buffer, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `inline; filename="${safeFileName}"`,
      "content-type": document.contentType,
      "x-content-type-options": "nosniff",
    },
  });
}
