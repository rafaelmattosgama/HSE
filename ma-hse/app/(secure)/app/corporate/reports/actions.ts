"use server";

import { RoleCode } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth/session";
import { ReportService } from "@/lib/services/report-service";

const REPORT_TYPES = new Set(["WEEKLY_DIGEST", "MONTHLY", "ANNUAL"]);

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
  const periodStartRaw = String(formData.get("periodStart") ?? "");
  const periodEndRaw = String(formData.get("periodEnd") ?? "");

  if (!REPORT_TYPES.has(reportType) || !periodStartRaw || !periodEndRaw) {
    redirect("/app/corporate/reports?error=invalid-input");
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
    notificationTitle: `Corporate ${reportType.toLowerCase()} report`,
    notificationBody: "Corporate report generated manually and shared automatically with N2 and N3.",
  });

  revalidatePath("/app/corporate/reports");
  redirect("/app/corporate/reports?generated=1");
}
