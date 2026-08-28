import { NextResponse } from "next/server";
import { RoleCode } from "@prisma/client";
import { fail } from "@/lib/api";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { StorageService } from "@/lib/services/storage-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ plantCode: string; workerId: string; examId: string; attachmentId: string }> },
) {
  const { plantCode, workerId, examId, attachmentId } = await context.params;
  const auth = await requirePlantAccess(plantCode, [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY, RoleCode.N6_HR]);
  if ("error" in auth) return auth.error;
  const plant = await getPlantByCode(plantCode);
  const attachment = await prisma.occupationalHealthExamAttachment.findFirst({
    where: {
      id: attachmentId,
      occupationalHealthExamId: examId,
      exam: { occupationalHealthWorkerId: workerId, plantId: plant.id },
    },
    select: { fileKey: true, fileName: true, contentType: true },
  });
  if (!attachment) return fail("NOT_FOUND", "Attachment not found", 404);

  const buffer = await StorageService.getObjectBuffer({ key: attachment.fileKey });
  const safeFileName = attachment.fileName.replace(/[\r\n"]/g, "");
  return new NextResponse(buffer, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `inline; filename="${safeFileName}"`,
      "content-type": attachment.contentType,
      "x-content-type-options": "nosniff",
    },
  });
}
