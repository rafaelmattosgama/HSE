import { startOfWeek, endOfWeek } from "date-fns";
import { prisma } from "@/lib/prisma";
import { NotificationService } from "@/lib/services/notification-service";
import { ReportService } from "@/lib/services/report-service";

export async function handleWeeklyDigest(data: { plantId: string }) {
  const periodStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const periodEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  const report = await ReportService.generatePeriodReport({
    plantId: data.plantId,
    reportType: "WEEKLY_DIGEST",
    periodStart,
    periodEnd,
  });

  const recipients = await prisma.reportRecipient.findMany({
    where: {
      list: {
        OR: [
          { plantId: data.plantId },
          { scope: "CORPORATE" },
        ],
      },
      isActive: true,
    },
    select: { email: true },
  });

  await NotificationService.notify({
    plantId: data.plantId,
    title: `Weekly digest ${report.title}`,
    body: "Weekly digest generated successfully.",
    emailTo: recipients.map((recipient) => recipient.email),
  });
}