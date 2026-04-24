import { startOfWeek, endOfWeek } from "date-fns";
import { ReportService } from "@/lib/services/report-service";

export async function handleWeeklyDigest() {
  const periodStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const periodEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  await ReportService.generateAndShareCorporatePeriodReport({
    reportType: "WEEKLY_DIGEST",
    periodStart,
    periodEnd,
    notificationTitle: "Corporate weekly digest",
    notificationBody: "Corporate weekly digest generated successfully for all plants and shared with N2 and N3.",
  });
}
