import { prisma } from "@/lib/prisma";
import { LINKABLE_COMMUNICATION_STATUSES } from "@/lib/communication-status";
import { buildPlantReportRankings } from "@/lib/plant-report-rankings";

export async function getPlantReportRankings(plantId: string, from: Date, to: Date) {
  const [communications, analyses, employees] = await prisma.$transaction([
    prisma.communication.findMany({
      where: { plantId, eventDatetime: { gte: from, lte: to }, status: { in: [...LINKABLE_COMMUNICATION_STATUSES] } },
      select: {
        plantId: true, status: true, type: true, eventDatetime: true,
        reporterEmployeeNo: true, targetText: true,
        targetEmployee: { select: { name: true, dept: true } },
        workstation: { select: { name: true } },
        unsafeActType: { select: { name: true } },
        unsafeConditionType: { select: { name: true } },
        nearMissType: { select: { name: true } },
      },
    }),
    prisma.sEWO.findMany({
      where: { plantId, deletedAt: null, analysisDate: { gte: from, lte: to } },
      select: {
        plantId: true, analysisDate: true, deletedAt: true, templateData: true,
        causeSelections: { select: { selected: true, isRootCause: true, causeItem: { select: { label: true } } } },
      },
    }),
    prisma.employeeDirectory.findMany({ where: { plantId }, select: { plantId: true, employeeNo: true, name: true, dept: true } }),
  ]);
  return buildPlantReportRankings({ communications, analyses, employees }, plantId, from, to);
}
