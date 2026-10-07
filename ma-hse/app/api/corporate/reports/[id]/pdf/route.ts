import { NextResponse } from "next/server";
import { getCorporateReportAccess } from "@/lib/rbac/corporate-reports";
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

  const access = getCorporateReportAccess(auth.session.user.plantRoles);
  if (!access.canRead) {
    return fail("FORBIDDEN", "You do not have access to corporate reports", 403);
  }

  const run = await prisma.reportRun.findUnique({
    where: { id },
    select: { fileKeys: true, plantId: true },
  });

  if (run && !access.global && (!run.plantId || !access.plantIds.includes(run.plantId))) {
    return fail("FORBIDDEN", "You do not have access to this report's scope", 403);
  }

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
