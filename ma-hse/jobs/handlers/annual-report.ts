import { endOfYear, startOfYear, subYears } from "date-fns";
import { prisma } from "@/lib/prisma";
import { NotificationService } from "@/lib/services/notification-service";
import { ReportService } from "@/lib/services/report-service";

export async function handleAnnualReport(data: { plantId: string }) {
  const previousYear = subYears(new Date(), 1);
  const periodStart = startOfYear(previousYear);
  const periodEnd = endOfYear(previousYear);

  const report = await ReportService.generatePeriodReport({
    plantId: data.plantId,
    reportType: "ANNUAL",
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
    title: `Annual safety report ${report.title}`,
    body: "Annual report generated successfully.",
    emailTo: recipients.map((recipient) => recipient.email),
  });
}