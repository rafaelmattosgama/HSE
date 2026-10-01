import { createPdfDocument } from "@/lib/services/pdfkit-helper";
import { buildCorporateSafetyReportData, pdfBufferFromCorporateSafetyReport } from "@/lib/services/corporate-safety-report";
import ExcelJS from "exceljs";
import { RoleCode } from "@prisma/client";
import { DASHBOARD_PYRAMID_COMMUNICATION_STATUSES } from "@/lib/communication-status";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { NotificationService } from "@/lib/services/notification-service";
import { KpiService } from "@/lib/services/kpi-service";
import { RecordCodeService } from "@/lib/services/record-code-service";
import { StorageService } from "@/lib/services/storage-service";
import { getPlantReportRankings } from "@/lib/services/plant-report-details";

function pdfBufferFromText(lines: string[]) {
  return new Promise<Buffer>((resolve) => {
    const doc = createPdfDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.fontSize(20).text("EHS Safety Report", { underline: true });
    doc.moveDown();

    for (const line of lines) {
      doc.fontSize(11).text(line);
    }

    doc.end();
  });
}

async function xlsxBufferFromSummary(summary: {
  title: string;
  total: number;
  byType: { type: string; count: number }[];
}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Summary");

  sheet.columns = [
    { header: "Metric", key: "metric", width: 32 },
    { header: "Value", key: "value", width: 24 },
  ];

  sheet.addRow({ metric: "Title", value: summary.title });
  sheet.addRow({ metric: "Total Valid Events", value: summary.total });

  sheet.addRow({ metric: "", value: "" });
  sheet.addRow({ metric: "Type", value: "Count" });

  summary.byType.forEach((entry) => sheet.addRow({ metric: entry.type, value: entry.count }));

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

function buildReportFileNames(input: { scope: string; reportType: "MONTHLY" | "ANNUAL" | "WEEKLY_DIGEST"; periodStart: Date; periodEnd: Date }) {
  const periodToken = `${format(input.periodStart, "yyyyMMdd")}-${format(input.periodEnd, "yyyyMMdd")}`;
  const baseName = `${input.scope}-${input.reportType.toLowerCase()}-${periodToken}`;

  return {
    pdf: `${baseName}.pdf`,
  };
}

function buildReportStorageKeys(input: {
  scope: string;
  reportType: "MONTHLY" | "ANNUAL" | "WEEKLY_DIGEST";
  periodStart: Date;
  periodEnd: Date;
}) {
  const periodToken = `${format(input.periodStart, "yyyyMMdd")}-${format(input.periodEnd, "yyyyMMdd")}`;
  const basePath = `reports/${input.scope}/${input.reportType.toLowerCase()}/${periodToken}`;
  const files = buildReportFileNames(input);

  return {
    pdfKey: `${basePath}/${files.pdf}`,
    files,
  };
}

function monthStartUtc(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}

function monthEndUtc(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

export const ReportService = {
  async generatePeriodReport(input: {
    plantId: string;
    reportType: "MONTHLY" | "ANNUAL" | "WEEKLY_DIGEST";
    periodStart: Date;
    periodEnd: Date;
  }) {
    const plant = await prisma.plant.findUniqueOrThrow({
      where: { id: input.plantId },
    });

    const year = input.periodStart.getUTCFullYear();
    const month = input.periodStart.getUTCMonth() + 1;

    const kpi = await KpiService.getMonthlyKpis(input.plantId, year, month);

    const byType = kpi.byType.map((entry) => ({
      type: entry.type,
      count: entry._count,
    }));

    const title = `${input.reportType} - ${plant.name} (${format(input.periodStart, "yyyy-MM-dd")} to ${format(input.periodEnd, "yyyy-MM-dd")})`;

    const pdf = await pdfBufferFromText([
      `Plant: ${plant.name} (${plant.code})`,
      `Period: ${format(input.periodStart, "yyyy-MM-dd")} - ${format(input.periodEnd, "yyyy-MM-dd")}`,
      `Total valid events: ${kpi.totalValidEvents}`,
      `Hours worked: ${kpi.hoursWorked}`,
      `Top causes (MVP): derived from S-EWO cause selections.`,
      `Top overdue actions (MVP): derived from open actions with due date < now.`,
    ]);

    const xlsx = await xlsxBufferFromSummary({
      title,
      total: kpi.totalValidEvents,
      byType,
    });

    return {
      title,
      meta: {
        reportType: input.reportType,
        plantId: input.plantId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
      pdf,
      xlsx,
    };
  },

  async generateCorporatePeriodReport(input: {
    reportType: "MONTHLY" | "ANNUAL" | "WEEKLY_DIGEST";
    periodStart: Date;
    periodEnd: Date;
    plantId?: string;
    recipients?: string[];
  }) {
    const selectedYear = input.periodEnd.getUTCFullYear();
    const selectedMonth = input.periodEnd.getUTCMonth() + 1;
    const historyEndYear = Math.max(selectedYear, 2025);
    const plantFilter = input.plantId ? { plantId: input.plantId } : {};
    const communicationSnapshotQuery = prisma.communication.groupBy({
      by: ["plantId", "status"],
      orderBy: [{ plantId: "asc" }, { status: "asc" }],
      where: { ...plantFilter, plant: { isActive: true } },
      _count: { _all: true },
    });
    const [plants, historicalCommunications, historicalKpiInputs, actions, communicationStatusCounts] = await prisma.$transaction([
      prisma.plant.findMany({
        where: input.plantId
          ? {
              id: input.plantId,
              isActive: true,
            }
          : {
              isActive: true,
            },
        select: {
          id: true,
          code: true,
          name: true,
        },
        orderBy: {
          name: "asc",
        },
      }),
      prisma.communication.findMany({
        where: {
          OR: [
            { eventDatetime: { gte: monthStartUtc(2022, 1), lte: monthEndUtc(historyEndYear, 12) } },
            { reportedAt: { gte: monthStartUtc(selectedYear, 1), lte: monthEndUtc(selectedYear, selectedMonth) } },
          ],
          status: {
            in: [...DASHBOARD_PYRAMID_COMMUNICATION_STATUSES],
          },
          ...plantFilter,
        },
        select: {
          plantId: true,
          type: true,
          lostDays: true,
          eventDatetime: true,
          reportedAt: true,
          status: true,
          actions: { select: { status: true } },
        },
      }),
      prisma.safetyKpiMonthlyInput.findMany({
        where: {
          year: {
            gte: 2022,
            lte: historyEndYear,
          },
          ...plantFilter,
        },
        select: {
          plantId: true,
          year: true,
          month: true,
          hoursWorked: true,
        },
      }),
      prisma.action.findMany({
        where: { ...plantFilter, plant: { isActive: true }, createdAt: { gte: monthStartUtc(selectedYear, 1), lte: monthEndUtc(selectedYear, selectedMonth) } },
        select: { plantId: true, status: true, createdAt: true, closedAt: true, dueDate: true },
      }),
      communicationSnapshotQuery,
    ]);

    if (input.plantId && plants.length === 0) {
      throw new Error("Selected plant was not found.");
    }

    const selectedPlant = input.plantId ? plants[0] : null;
    const reportScope = selectedPlant ? "FACTORY" : "GLOBAL";
    const plantLabel = selectedPlant ? `${selectedPlant.name} (${selectedPlant.code.toUpperCase()})` : null;
    const scopeLabel = plantLabel ? `Factory: ${plantLabel}` : "Global";
    const plantRankings = selectedPlant
      ? await getPlantReportRankings(selectedPlant.id, monthStartUtc(selectedYear, 1), monthEndUtc(selectedYear, selectedMonth))
      : undefined;
    const safetyReport = buildCorporateSafetyReportData({
      plants,
      selectedPlantId: selectedPlant?.id,
      plantRankings,
      communications: historicalCommunications,
      actions,
      communicationStatusCounts: communicationStatusCounts.map(entry => ({ plantId: entry.plantId, status: entry.status, count: entry._count._all })),
      kpiInputs: historicalKpiInputs.map((entry) => ({
        plantId: entry.plantId,
        year: entry.year,
        month: entry.month,
        hoursWorked: Number(entry.hoursWorked),
      })),
      selectedYear,
      selectedMonth,
      scopeLabel,
    });

    const title = `${input.reportType} - ${plantLabel ?? "Global"} (${format(input.periodStart, "yyyy-MM-dd")} to ${format(input.periodEnd, "yyyy-MM-dd")})`;
    const pdf = await pdfBufferFromCorporateSafetyReport(safetyReport);

    const storage = buildReportStorageKeys({
      scope: selectedPlant ? `corporate-${selectedPlant.code.toLowerCase()}` : "corporate",
      reportType: input.reportType,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });

    await StorageService.uploadObject({
      key: storage.pdfKey,
      contentType: "application/pdf",
      body: pdf,
    });

    await prisma.$transaction(async (tx) => {
      const recordCode = await RecordCodeService.allocateReportCode(tx, {
        reportType: input.reportType,
        codigoFabrica: selectedPlant?.code ?? "GLOBAL",
        periodStart: input.periodStart,
      });

      await tx.reportRun.create({
        data: {
          plantId: selectedPlant?.id ?? null,
          type: input.reportType,
          codigoCompleto: recordCode.codigoCompleto,
          codigoAbreviado: recordCode.codigoAbreviado,
          tipo: recordCode.tipo,
          codigoFabrica: recordCode.codigoFabrica,
          ano: recordCode.ano,
          numeroSequencial: recordCode.numeroSequencial,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          fileKeys: {
            pdfKey: storage.pdfKey,
            pdfFileName: storage.files.pdf,
            scope: reportScope,
            scopeLabel,
            plantCode: selectedPlant?.code ?? null,
            plantName: selectedPlant?.name ?? null,
          },
          recipients: input.recipients ?? [],
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });
    });

    return {
      title,
      files: storage.files,
      storageKeys: {
        pdfKey: storage.pdfKey,
      },
      meta: {
        reportType: input.reportType,
        scope: reportScope,
        plantId: selectedPlant?.id ?? null,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
      pdf,
    };
  },

  async getCorporateReportAudience(input?: { plantId?: string }) {
    const [corporateRecipients, roleRecipients] = await prisma.$transaction([
      prisma.reportRecipient.findMany({
        where: {
          list: {
            scope: input?.plantId ? "PLANT" : "CORPORATE",
            plantId: input?.plantId,
          },
          isActive: true,
        },
        select: {
          email: true,
        },
      }),
      prisma.userPlantRole.findMany({
        where: {
          role: {
            code: {
              in: [RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY],
            },
          },
          ...(input?.plantId ? { plantId: input.plantId } : {}),
          user: {
            isActive: true,
            email: {
              not: null,
            },
          },
        },
        select: {
          userId: true,
          user: {
            select: {
              email: true,
            },
          },
        },
      }),
    ]);

    return {
      emails: Array.from(
        new Set([
          ...corporateRecipients.map((recipient) => recipient.email),
          ...roleRecipients.map((recipient) => recipient.user.email).filter((email): email is string => Boolean(email)),
        ]),
      ),
      userIds: Array.from(new Set(roleRecipients.map((recipient) => recipient.userId))),
    };
  },

  async generateAndShareCorporatePeriodReport(input: {
    reportType: "MONTHLY" | "ANNUAL" | "WEEKLY_DIGEST";
    periodStart: Date;
    periodEnd: Date;
    plantId?: string;
    notificationTitle: string;
    notificationBody: string;
  }) {
    const audience = await this.getCorporateReportAudience({ plantId: input.plantId });
    const report = await this.generateCorporatePeriodReport({
      reportType: input.reportType,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      plantId: input.plantId,
      recipients: audience.emails,
    });

    await NotificationService.notify({
      title: input.notificationTitle,
      body: input.notificationBody,
      emailTo: audience.emails,
      userIds: audience.userIds,
      attachments: [
        {
          filename: report.files.pdf,
          content: report.pdf,
          contentType: "application/pdf",
        },
      ],
    });

    return report;
  },
};
