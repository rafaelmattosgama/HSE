import { endOfYear, startOfYear, subYears } from "date-fns";
import { ReportService } from "@/lib/services/report-service";

export async function handleAnnualReport() {
  const previousYear = subYears(new Date(), 1);
  const periodStart = startOfYear(previousYear);
  const periodEnd = endOfYear(previousYear);

  await ReportService.generateAndShareCorporatePeriodReport({
    reportType: "ANNUAL",
    periodStart,
    periodEnd,
    notificationTitle: "Corporate annual safety report",
    notificationBody: "Corporate annual report generated successfully for all plants and shared with N2 and N3.",
  });
}
