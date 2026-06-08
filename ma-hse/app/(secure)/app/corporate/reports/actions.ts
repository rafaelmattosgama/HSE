"use server";

import { RoleCode } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { ReportService } from "@/lib/services/report-service";

const REPORT_TYPES = new Set(["WEEKLY_DIGEST", "MONTHLY", "ANNUAL"]);
const REPORT_SCOPES = new Set(["GLOBAL", "FACTORY"]);

export async function generateCorporateReportAction(formData: FormData) {
  const session = await getServerAuthSession();

  if (!session?.user) {
    redirect("/login");
  }

  const isCorporate = session.user.plantRoles?.some((entry) => entry.role === RoleCode.N1_CORPORATE);
  if (!isCorporate) {
    redirect("/app/corporate/reports?error=forbidden");
  }

  const reportType = String(formData.get("reportType") ?? "");
  const scope = String(formData.get("scope") ?? "");
  const factoryId = String(formData.get("factoryId") ?? "");
  const periodStartRaw = String(formData.get("periodStart") ?? "");
  const periodEndRaw = String(formData.get("periodEnd") ?? "");

  if (!REPORT_TYPES.has(reportType) || !REPORT_SCOPES.has(scope) || !periodStartRaw || !periodEndRaw) {
    redirect("/app/corporate/reports?error=invalid-input");
  }

  const selectedFactory = scope === "FACTORY"
    ? await prisma.plant.findFirst({
        where: {
          id: factoryId,
          isActive: true,
        },
        select: {
          id: true,
          code: true,
          name: true,
        },
      })
    : null;

  if (scope === "FACTORY" && !selectedFactory) {
    redirect("/app/corporate/reports?error=missing-factory");
  }

  const periodStart = new Date(`${periodStartRaw}T00:00:00.000Z`);
  const periodEnd = new Date(`${periodEndRaw}T23:59:59.999Z`);

  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodStart > periodEnd) {
    redirect("/app/corporate/reports?error=invalid-period");
  }

  await ReportService.generateAndShareCorporatePeriodReport({
    reportType: reportType as "WEEKLY_DIGEST" | "MONTHLY" | "ANNUAL",
    periodStart,
    periodEnd,
    plantId: selectedFactory?.id,
    notificationTitle: selectedFactory
      ? `${selectedFactory.code.toUpperCase()} ${reportType.toLowerCase()} report`
      : `Global ${reportType.toLowerCase()} report`,
    notificationBody: selectedFactory
      ? `Factory report generated manually for ${selectedFactory.name} (${selectedFactory.code.toUpperCase()}) and shared automatically with N2 and N3 for that factory.`
      : "Global report generated manually and shared automatically with N2 and N3.",
  });

  revalidatePath("/app/corporate/reports");
  redirect("/app/corporate/reports?generated=1");
}
