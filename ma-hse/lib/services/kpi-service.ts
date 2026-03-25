import { CommunicationStatus } from "@prisma/client";
import { endOfMonth, startOfMonth } from "date-fns";
import { prisma } from "@/lib/prisma";

const KPI_STATUSES = [CommunicationStatus.VALID_OPEN, CommunicationStatus.ONGOING, CommunicationStatus.CLOSED];

export const KpiService = {
  async getMonthlyKpis(plantId: string, year: number, month: number) {
    const from = startOfMonth(new Date(Date.UTC(year, month - 1, 1)));
    const to = endOfMonth(from);

    const totalValidEvents = await prisma.communication.count({
      where: {
        plantId,
        status: { in: KPI_STATUSES },
        eventDatetime: {
          gte: from,
          lte: to,
        },
      },
    });

    const byType = await prisma.communication.groupBy({
      by: ["type"],
      where: {
        plantId,
        status: { in: KPI_STATUSES },
        eventDatetime: {
          gte: from,
          lte: to,
        },
      },
      _count: true,
    });

    const hoursWorked = await prisma.safetyKpiMonthlyInput.findUnique({
      where: {
        plantId_year_month: {
          plantId,
          year,
          month,
        },
      },
    });

    return {
      totalValidEvents,
      byType,
      hoursWorked: Number(hoursWorked?.hoursWorked ?? 0),
      period: {
        year,
        month,
      },
    };
  },
};