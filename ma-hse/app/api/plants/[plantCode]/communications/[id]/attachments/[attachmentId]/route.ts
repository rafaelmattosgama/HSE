import { NextResponse } from "next/server";
import { RoleCode } from "@prisma/client";
import { fail } from "@/lib/api";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { StorageService } from "@/lib/services/storage-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ plantCode: string; id: string; attachmentId: string }> },
) {
  const { plantCode, id, attachmentId } = await context.params;

  const auth = await requirePlantAccess(plantCode, [
    RoleCode.N0_ADMIN,
    RoleCode.N1_CORPORATE,
    RoleCode.N2_PLANT_MANAGER,
    RoleCode.N3_SAFETY,
    RoleCode.N4_SUPERVISOR,
    RoleCode.N5_OPERATOR,
    RoleCode.MEDICO,
  ]);
  if ("error" in auth) return auth.error;

  const plant = await getPlantByCode(plantCode);
  const attachment = await prisma.communicationAttachment.findFirst({
    where: {
      id: attachmentId,
      communicationId: id,
      communication: {
        plantId: plant.id,
      },
    },
    select: {
      fileKey: true,
      contentType: true,
    },
  });

  if (!attachment) {
    return fail("NOT_FOUND", "Attachment not found", 404);
  }

  const url = await StorageService.getPresignedDownloadUrl({
    key: attachment.fileKey,
    expiresInSec: 300,
  });

  return NextResponse.redirect(url, {
    headers: {
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
