import { endOfMonth, startOfMonth, subMonths } from "date-fns";
import { ReportService } from "@/lib/services/report-service";

export async function handleMonthlyReport() {
  const lastMonth = subMonths(new Date(), 1);
  const periodStart = startOfMonth(lastMonth);
  const periodEnd = endOfMonth(lastMonth);

  await ReportService.generateAndShareCorporatePeriodReport({
    reportType: "MONTHLY",
    periodStart,
    periodEnd,
    notificationTitle: "Corporate monthly safety report",
    notificationBody: "Corporate monthly report generated successfully for all plants and shared with N2 and N3.",
  });
}
