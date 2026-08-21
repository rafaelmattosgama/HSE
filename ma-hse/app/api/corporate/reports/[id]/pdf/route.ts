import { NextResponse } from "next/server";
import { RoleCode } from "@prisma/client";
import { fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac/guards";
import { StorageService } from "@/lib/services/storage-service";

type ReportFileKeys = {
  pdfKey?: string;
  pdfFileName?: string;
};

function getFileKeys(value: unknown): ReportFileKeys {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as ReportFileKeys;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const isCorporate = auth.session.user.plantRoles?.some((entry) => entry.role === RoleCode.N0_ADMIN || entry.role === RoleCode.N1_CORPORATE);
  if (!isCorporate) {
    return fail("FORBIDDEN", "Only N1 Corporate users can download corporate reports", 403);
  }

  const run = await prisma.reportRun.findUnique({
    where: { id },
    select: { fileKeys: true },
  });

  const fileKeys = getFileKeys(run?.fileKeys);
  if (!run || !fileKeys.pdfKey) {
    return fail("NOT_FOUND", "Report not found", 404);
  }

  const buffer = await StorageService.getObjectBuffer({ key: fileKeys.pdfKey });
  const safeFileName = (fileKeys.pdfFileName ?? "report.pdf").replace(/[\r\n"]/g, "");

  return new NextResponse(buffer, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `inline; filename="${safeFileName}"`,
      "content-type": "application/pdf",
      "x-content-type-options": "nosniff",
    },
  });
}
