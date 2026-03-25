import { endOfMonth, startOfMonth, subMonths } from "date-fns";
import { prisma } from "@/lib/prisma";
import { NotificationService } from "@/lib/services/notification-service";
import { ReportService } from "@/lib/services/report-service";

export async function handleMonthlyReport(data: { plantId: string }) {
  const lastMonth = subMonths(new Date(), 1);
  const periodStart = startOfMonth(lastMonth);
  const periodEnd = endOfMonth(lastMonth);

  const report = await ReportService.generatePeriodReport({
    plantId: data.plantId,
    reportType: "MONTHLY",
    periodStart,
    periodEnd,
  });

  const recipients = await prisma.reportRecipient.findMany({
    where: {
      list: {
        OR: [{ plantId: data.plantId }, { scope: "CORPORATE" }],
      },
      isActive: true,
    },
    select: { email: true },
  });

  await NotificationService.notify({
    plantId: data.plantId,
    title: `Monthly safety report ${report.title}`,
    body: "Monthly report generated successfully.",
    emailTo: recipients.map((recipient) => recipient.email),
  });
}